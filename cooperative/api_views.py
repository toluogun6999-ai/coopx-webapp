"""
CoopSys REST API Views (DRF)
============================
Replaces every Supabase call the CoopX frontend made.
Auth uses DRF token authentication.
"""
import uuid
from decimal import Decimal
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import transaction as db_transaction
from django.db.models import Sum, Q, Prefetch
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.views.decorators.csrf import csrf_exempt

from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.authentication import TokenAuthentication, SessionAuthentication

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from .models import (
    Member, Savings, Loan, Repayment, Contribution,
    Transaction, Notification, MLPrediction, CoopSettings, BankAccount, ExchangeRate
)
from .serializers import (
    ProfileSerializer, LoanSerializer, SavingsTransactionSerializer,
    RepaymentSerializer, NotificationSerializer, AnnouncementSerializer,
    AuditLogSerializer, SettingsSerializer, UserSerializer,
    BankAccountSerializer, TransactionSerializer, ExchangeRateSerializer,
)
from .ml.predictor import predict_default_risk, get_model_metrics, train_model, is_model_trained
from . import payments
from . import exports


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def is_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff:
        return True
    try:
        return user.member_profile.is_admin
    except Exception:
        return False


def get_member(user):
    try:
        return user.member_profile
    except Exception:
        return None


def get_role(user):
    """Returns the effective role string for `user`: 'admin', 'treasurer',
    'secretary', 'auditor', or 'member'. Django superusers/staff are always
    treated as 'admin' regardless of their Member.role."""
    if not user or not user.is_authenticated:
        return "member"
    if user.is_staff:
        return "admin"
    member = get_member(user)
    if member and member.is_admin:
        return member.role or "admin"
    return "member"


# Which roles may perform which class of admin action. 'admin' implicitly
# has every permission — checked separately in each helper below.
_FINANCE_ROLES = {"admin", "treasurer"}
_MEMBER_MGMT_ROLES = {"admin", "secretary"}
_REPORT_READ_ROLES = {"admin", "treasurer", "secretary", "auditor"}


def can_manage_finance(user):
    """Approve/reject loans, record repayments, edit exchange rates & settings."""
    return get_role(user) in _FINANCE_ROLES


def can_manage_members(user):
    """Register members, edit member status/details, post announcements."""
    return get_role(user) in _MEMBER_MGMT_ROLES


def can_read_reports(user):
    """View financial reports, audit logs, dashboard stats (read-only for auditor)."""
    return get_role(user) in _REPORT_READ_ROLES


def is_full_admin(user):
    """Strictly the Administrator role — system config (ML retrain, etc.)."""
    return get_role(user) == "admin"


def compute_ml_features(member, loan_amount, tenure=12):
    defaults = Loan.objects.filter(member=member, status="overdue").count()
    contrib_total = Contribution.objects.filter(member=member).count()
    contrib_paid = Contribution.objects.filter(member=member, is_paid=True).count()
    consistency = (contrib_paid / contrib_total) if contrib_total > 0 else 0.5
    rep_history = Repayment.objects.filter(loan__member=member)
    on_time = rep_history.filter(is_late=False).count()
    rep_score = (on_time / rep_history.count() * 100) if rep_history.count() > 0 else 50
    return {
        "savings_balance": float(member.total_savings),
        "loan_amount": float(loan_amount),
        "months_as_member": member.months_as_member,
        "previous_defaults": defaults,
        "contribution_consistency": consistency,
        "monthly_income": float(member.monthly_income),
        "tenure_months": tenure,
        "repayment_history_score": rep_score,
    }


# ═══════════════════════════════════════════════════════════════════════════
# AUTHENTICATION ENDPOINTS  (replace supabase.auth.*)
# ═══════════════════════════════════════════════════════════════════════════

def _lockout_cache_key(identifier, request):
    ip = request.META.get("REMOTE_ADDR", "unknown")
    return f"login_attempts:{identifier.lower()}:{ip}"


def ip_rate_limited(request, bucket, limit=10, window_seconds=3600):
    """Simple fixed-window IP rate limiter for unauthenticated write
    endpoints (signup, password-reset requests) that don't otherwise have
    per-account throttling. Returns True if the caller should be blocked."""
    ip = request.META.get("REMOTE_ADDR", "unknown")
    key = f"ratelimit:{bucket}:{ip}"
    count = cache.get(key, 0)
    if count >= limit:
        return True
    cache.set(key, count + 1, timeout=window_seconds)
    return False


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_login(request):
    """POST /api/auth/login/  {email/username, password}  → {token, user, roles}"""
    identifier = request.data.get("email") or request.data.get("username")
    password = request.data.get("password")
    if not identifier or not password:
        return Response({"error": "Email and password required"}, status=400)

    cache_key = _lockout_cache_key(identifier, request)
    attempts = cache.get(cache_key, 0)
    if attempts >= settings.LOGIN_ATTEMPT_LIMIT:
        return Response(
            {"error": "Too many failed login attempts. Please try again later."},
            status=429,
        )

    # Allow login by email or username
    user = authenticate(username=identifier, password=password)
    if user is None:
        try:
            u = User.objects.get(email__iexact=identifier)
            user = authenticate(username=u.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is None:
        cache.set(cache_key, attempts + 1, timeout=settings.LOGIN_ATTEMPT_LOCKOUT_SECONDS)
        return Response({"error": "Invalid credentials"}, status=401)

    cache.delete(cache_key)
    token, _ = Token.objects.get_or_create(user=user)
    roles = [get_role(user)]

    return Response({
        "token": token.key,
        "access_token": token.key,
        "user": UserSerializer(user).data,
        "role": roles[0],
        "roles": roles,
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_google_login(request):
    """POST /api/auth/google/  {credential}  → {token, user, roles}

    `credential` is the Google ID token returned by Google Identity Services
    on the frontend. We verify it server-side against Google's public keys —
    the frontend never gets to assert who the user is on its own.
    """
    credential = request.data.get("credential")
    if not credential:
        return Response({"error": "Missing Google credential"}, status=400)
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        return Response({"error": "Google sign-in is not configured"}, status=503)

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
        )
    except ValueError:
        return Response({"error": "Invalid Google credential"}, status=401)

    email = idinfo.get("email")
    if not email or not idinfo.get("email_verified", False):
        return Response({"error": "Google account email is not verified"}, status=401)

    first_name = idinfo.get("given_name", "")
    last_name = idinfo.get("family_name", "")

    user = User.objects.filter(email__iexact=email).first()
    created = False
    if user is None:
        base_username = email.split("@")[0]
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{i}"
            i += 1
        user = User.objects.create_user(
            username=username, email=email,
            password=uuid.uuid4().hex,  # unusable random password; user signed in via Google
            first_name=first_name, last_name=last_name,
        )
        created = True

    if not hasattr(user, "member_profile"):
        Member.objects.create(
            user=user, phone="", gender="M", address="",
            status="active",
        )

    token, _ = Token.objects.get_or_create(user=user)
    roles = [get_role(user)]
    return Response({
        "token": token.key,
        "access_token": token.key,
        "user": UserSerializer(user).data,
        "role": roles[0],
        "roles": roles,
        "created": created,
    }, status=201 if created else 200)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_signup(request):
    """POST /api/auth/signup/  → creates member + returns token"""
    if ip_rate_limited(request, "signup", limit=10, window_seconds=3600):
        return Response({"error": "Too many signup attempts. Please try again later."}, status=429)

    data = request.data
    email = data.get("email")
    password = data.get("password")
    full_name = data.get("full_name", "") or data.get("fullName", "")

    if not email or not password:
        return Response({"error": "Email and password required"}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return Response({"error": "Email already registered"}, status=400)

    username = email.split("@")[0]
    base_username = username
    i = 1
    while User.objects.filter(username=username).exists():
        username = f"{base_username}{i}"; i += 1

    parts = full_name.strip().split(" ", 1)
    first = parts[0] if parts else ""
    last = parts[1] if len(parts) > 1 else ""

    user = User.objects.create_user(
        username=username, email=email, password=password,
        first_name=first, last_name=last,
    )
    Member.objects.create(
        user=user,
        phone=data.get("phone", ""),
        gender=data.get("gender", "M"),
        address=data.get("address", ""),
        monthly_income=Decimal(str(data.get("income", 0) or 0)),
        status="active",
    )
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        "token": token.key,
        "access_token": token.key,
        "user": UserSerializer(user).data,
        "role": "member",
        "roles": ["member"],
    }, status=201)


@api_view(["POST"])
def api_logout(request):
    """POST /api/auth/logout/"""
    if request.user.is_authenticated:
        Token.objects.filter(user=request.user).delete()
    return Response({"success": True})


@api_view(["GET"])
def api_me(request):
    """GET /api/auth/me/  → current user + roles + profile (replaces getUser/getSession)"""
    if not request.user.is_authenticated:
        return Response({"user": None, "roles": []}, status=200)
    member = get_member(request.user)
    roles = [get_role(request.user)]
    return Response({
        "user": UserSerializer(request.user).data,
        "role": roles[0],
        "roles": roles,
        "profile": ProfileSerializer(member).data if member else None,
    })


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_password_reset(request):
    """POST /api/auth/password-reset/  {email}  → sends a real reset link"""
    if ip_rate_limited(request, "password_reset", limit=5, window_seconds=900):
        return Response({"error": "Too many reset attempts. Please try again later."}, status=429)

    email = request.data.get("email")
    generic_response = Response({
        "success": True,
        "message": "If that email is registered, a password reset link has been sent.",
    })
    if not email:
        return Response({"error": "Email required"}, status=400)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        # Don't reveal whether the email exists
        return generic_response

    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?uid={uidb64}&token={token}"

    send_mail(
        subject="Reset your CoopSys password",
        message=(
            f"Hi {user.first_name or user.username},\n\n"
            f"Click the link below to reset your password:\n{reset_url}\n\n"
            f"If you didn't request this, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )
    return generic_response


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_password_reset_confirm(request):
    """POST /api/auth/password-reset/confirm/  {uid, token, password}"""
    if ip_rate_limited(request, "password_reset_confirm", limit=10, window_seconds=900):
        return Response({"error": "Too many attempts. Please try again later."}, status=429)

    uidb64 = request.data.get("uid")
    token = request.data.get("token")
    new_password = request.data.get("password")
    if not uidb64 or not token or not new_password:
        return Response({"error": "uid, token and password are required"}, status=400)
    if len(new_password) < 10:
        return Response({"error": "Password must be at least 10 characters"}, status=400)

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return Response({"error": "Invalid reset link"}, status=400)

    if not default_token_generator.check_token(user, token):
        return Response({"error": "Invalid or expired reset link"}, status=400)

    user.set_password(new_password)
    user.save()
    Token.objects.filter(user=user).delete()  # invalidate old sessions
    return Response({"success": True})


@api_view(["POST"])
def api_update_password(request):
    """POST /api/auth/update-password/  {current_password, password}"""
    if not request.user.is_authenticated:
        return Response({"error": "Not authenticated"}, status=401)

    current_password = request.data.get("current_password")
    new_password = request.data.get("password")
    if not current_password:
        return Response({"error": "Current password is required"}, status=400)
    if not request.user.check_password(current_password):
        return Response({"error": "Current password is incorrect"}, status=401)
    if not new_password or len(new_password) < 10:
        return Response({"error": "Password must be at least 10 characters"}, status=400)

    request.user.set_password(new_password)
    request.user.save()
    # Rotate the token so any other logged-in device is signed out.
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)
    return Response({"success": True, "token": token.key})


# ═══════════════════════════════════════════════════════════════════════════
# PROFILES / MEMBERS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_profiles(request):
    """GET /api/profiles/  (admin: all, member: own)"""
    if is_admin_user(request.user):
        members = Member.objects.select_related("user").order_by("-join_date")
    else:
        member = get_member(request.user)
        members = [member] if member else []
    return Response(ProfileSerializer(members, many=True).data)


@api_view(["PATCH"])
def api_update_my_profile(request):
    """PATCH /api/profiles/me/  {full_name, phone}
    Lets the signed-in member update their own display name and phone
    (as opposed to /profiles/<id>/status/, which is admin-only)."""
    member = get_member(request.user)
    if member is None:
        return Response({"error": "Member profile not found"}, status=404)

    full_name = request.data.get("full_name")
    if full_name:
        parts = full_name.strip().split(" ", 1)
        request.user.first_name = parts[0]
        request.user.last_name = parts[1] if len(parts) > 1 else ""
        request.user.save(update_fields=["first_name", "last_name"])

    phone = request.data.get("phone")
    if phone is not None:
        member.phone = phone
        member.save(update_fields=["phone"])

    return Response(ProfileSerializer(member).data)


@api_view(["GET"])
def api_profile_detail(request, member_id):
    """GET /api/profiles/<member_id>/"""
    try:
        member = Member.objects.get(member_id=member_id)
    except Member.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
    if not is_admin_user(request.user) and get_member(request.user) != member:
        return Response({"error": "Forbidden"}, status=403)
    return Response(ProfileSerializer(member).data)


@api_view(["PATCH"])
def api_update_member_status(request, member_id):
    """PATCH /api/profiles/<member_id>/status/  {status, reason}"""
    if not can_manage_members(request.user):
        return Response({"error": "Admin or Secretary only"}, status=403)
    try:
        member = Member.objects.get(member_id=member_id)
    except Member.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
    status_map = {"Approved": "active", "Inactive": "inactive",
                  "Suspended": "suspended", "Rejected": "inactive"}
    new_status = status_map.get(request.data.get("status"), "active")
    member.status = new_status
    member.save()
    return Response(ProfileSerializer(member).data)


@api_view(["PATCH"])
def api_update_member_role(request, member_id):
    """PATCH /api/profiles/<member_id>/role/  {role}
    Admin-only: promote/demote a member to Treasurer/Secretary/Auditor/Admin/Member.
    Restricted to the strict Admin role so a Secretary or Treasurer can't
    grant themselves (or anyone else) broader access."""
    if not is_full_admin(request.user):
        return Response({"error": "Admin only"}, status=403)
    try:
        member = Member.objects.get(member_id=member_id)
    except Member.DoesNotExist:
        return Response({"error": "Not found"}, status=404)

    role = request.data.get("role")
    valid_roles = dict(Member.ROLE_CHOICES)
    if role not in valid_roles:
        return Response({"error": f"role must be one of {list(valid_roles)}"}, status=400)

    member.role = role
    member.is_admin = role != "member"
    member.save(update_fields=["role", "is_admin"])
    return Response(ProfileSerializer(member).data)


# ═══════════════════════════════════════════════════════════════════════════
# LOANS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_loans(request):
    """GET /api/loans/  (admin: all, member: own)"""
    loans_qs = Loan.objects.select_related("member__user").prefetch_related(
        Prefetch("mlprediction_set", queryset=MLPrediction.objects.order_by("-prediction_date"),
                 to_attr="_prefetched_predictions")
    )
    if is_admin_user(request.user):
        loans = loans_qs.order_by("-application_date")
    else:
        member = get_member(request.user)
        loans = loans_qs.filter(member=member).order_by("-application_date") if member else []
    return Response(LoanSerializer(loans, many=True).data)


@api_view(["POST"])
def api_loan_apply(request):
    """POST /api/loans/  {amount, tenure_months, purpose}"""
    member = get_member(request.user)
    if not member:
        return Response({"error": "Member profile not found"}, status=400)

    # Block if active/pending loan exists
    if Loan.objects.filter(member=member, status__in=["active", "overdue", "pending"]).exists():
        return Response({"error": "You have an existing active or pending loan"}, status=400)

    settings = CoopSettings.get_settings()
    if member.total_savings < settings.min_savings_for_loan:
        return Response({
            "error": f"You need at least ₦{settings.min_savings_for_loan:,.2f} in savings to apply "
                     f"(current: ₦{member.total_savings:,.2f})",
        }, status=400)
    if member.months_as_member < settings.min_months_for_loan:
        return Response({
            "error": f"You need at least {settings.min_months_for_loan} month(s) of membership to apply "
                     f"(current: {member.months_as_member})",
        }, status=400)

    amount = Decimal(str(request.data.get("amount", 0)))
    tenure = int(request.data.get("tenure_months", 12))
    purpose = request.data.get("purpose", "personal")
    loan = Loan.objects.create(
        member=member,
        amount_requested=amount,
        interest_rate=settings.default_interest_rate,
        tenure_months=tenure,
        purpose=purpose[:20] if purpose in dict(Loan.PURPOSE_CHOICES) else "personal",
        purpose_description=purpose,
        status="pending",
    )

    # Run ML prediction immediately
    try:
        features = compute_ml_features(member, amount, tenure)
        result = predict_default_risk(features)
        loan.risk_score = result["risk_level"]
        loan.risk_probability = result["default_probability"] / 100
        loan.save()
        MLPrediction.objects.create(
            member=member, loan=loan,
            risk_level=result["risk_level"],
            default_probability=result["default_probability"] / 100,
            savings_balance=member.total_savings,
            loan_amount=amount,
            months_as_member=member.months_as_member,
            feature_importances=result.get("feature_analysis"),
        )
    except Exception:
        pass

    # Notify admins
    for admin in User.objects.filter(is_staff=True):
        Notification.objects.create(
            recipient=admin, notification_type="general",
            title=f"New Loan Application: {loan.loan_id}",
            message=f"{member.full_name} applied for ₦{amount:,.2f}",
        )
    # application_date is a DateField defaulting to timezone.now() (a
    # datetime) — the in-memory value stays a datetime until it round-trips
    # through the DB, which crashes LoanSerializer below the same way it did
    # for Savings.date. Refresh to get the DB-coerced value.
    loan.refresh_from_db()
    return Response(LoanSerializer(loan).data, status=201)


@api_view(["PATCH"])
def api_loan_decide(request, loan_id):
    """PATCH /api/loans/<loan_id>/  {status, note}"""
    if not can_manage_finance(request.user):
        return Response({"error": "Admin or Treasurer only"}, status=403)
    try:
        loan = Loan.objects.get(loan_id=loan_id)
    except Loan.DoesNotExist:
        return Response({"error": "Not found"}, status=404)

    decision = request.data.get("status")  # Approved / Rejected / Disbursed
    note = request.data.get("note", "")

    status_map = {"Approved": "approved", "Rejected": "rejected",
                  "Disbursed": "active", "Repaid": "repaid"}
    new_status = status_map.get(decision, loan.status)
    loan.status = new_status

    if new_status in ("approved", "active"):
        loan.amount_approved = loan.amount_approved or loan.amount_requested
        loan.approval_date = date.today()
        loan.approved_by = request.user
        if new_status == "active":
            loan.disbursement_date = date.today()
            loan.due_date = date.today() + timedelta(days=loan.tenure_months * 30)
            Transaction.objects.create(
                member=loan.member, transaction_type="loan_disbursement",
                amount=loan.amount_approved,
                description=f"Loan disbursement — {loan.loan_id}",
                reference_id=loan.loan_id, performed_by=request.user,
            )
        Notification.objects.create(
            recipient=loan.member.user, notification_type="loan_approved",
            title="Loan Approved!",
            message=f"Your loan {loan.loan_id} of ₦{loan.amount_approved:,.2f} was approved.",
        )
    elif new_status == "rejected":
        loan.rejection_reason = note
        Notification.objects.create(
            recipient=loan.member.user, notification_type="loan_rejected",
            title="Loan Application Rejected",
            message=f"Your loan {loan.loan_id} was not approved. {note}",
        )

    loan.save()
    return Response(LoanSerializer(loan).data)


@api_view(["POST"])
def api_loan_repayment(request, loan_id):
    """POST /api/loans/<loan_id>/repayments/  {amount}"""
    if not can_manage_finance(request.user):
        return Response({"error": "Admin or Treasurer only"}, status=403)
    try:
        loan = Loan.objects.get(loan_id=loan_id)
    except Loan.DoesNotExist:
        return Response({"error": "Not found"}, status=404)

    amount = Decimal(str(request.data.get("amount", 0)))
    rep = Repayment.objects.create(
        loan=loan, amount=amount, payment_date=date.today(),
        installment_number=loan.repayments.count() + 1,
        status="confirmed", recorded_by=request.user,
    )
    if loan.outstanding_balance <= 0:
        loan.status = "repaid"
        loan.save()
    Transaction.objects.create(
        member=loan.member, transaction_type="loan_repayment",
        amount=amount, description=f"Repayment for {loan.loan_id}",
        reference_id=loan.loan_id, performed_by=request.user,
    )
    # Same DateField/datetime-default landmine as Savings.date and
    # Loan.application_date — refresh before serializing.
    rep.refresh_from_db()
    return Response(RepaymentSerializer(rep).data, status=201)


# ═══════════════════════════════════════════════════════════════════════════
# SAVINGS TRANSACTIONS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_transactions(request):
    """GET /api/savings/  (admin: all, member: own)"""
    if is_admin_user(request.user):
        savings = Savings.objects.select_related("member__user").order_by("-date")
    else:
        member = get_member(request.user)
        savings = (
            Savings.objects.filter(member=member).select_related("member__user").order_by("-date")
            if member else []
        )
    return Response(SavingsTransactionSerializer(savings, many=True).data)


@api_view(["POST"])
def api_add_contribution(request):
    """POST /api/savings/  {amount, note}"""
    member = get_member(request.user)
    # Admin/Treasurer can add on behalf of a member_id
    target_member_id = request.data.get("member_id")
    if can_manage_finance(request.user) and target_member_id:
        try:
            member = Member.objects.get(member_id=target_member_id)
        except Member.DoesNotExist:
            return Response({"error": "Member not found"}, status=404)
    if not member:
        return Response({"error": "Member not found"}, status=400)

    amount = Decimal(str(request.data.get("amount", 0)))
    note = request.data.get("note", "")
    txn_type = request.data.get("type", "Contribution")

    dj_type = "withdrawal" if txn_type == "Withdrawal" else "deposit"
    if dj_type == "deposit":
        new_balance = member.total_savings + amount
    else:
        if amount > member.total_savings:
            return Response({"error": "Withdrawal amount exceeds current balance"}, status=400)
        new_balance = member.total_savings - amount

    with db_transaction.atomic():
        savings = Savings.objects.create(
            member=member, amount=amount, transaction_type=dj_type,
            balance_after=new_balance, description=note,
            recorded_by=request.user if request.user.is_authenticated else None,
        )
        # `date` is a DateField but defaults to timezone.now() (a datetime);
        # the in-memory value stays a datetime until it round-trips through
        # the DB, which crashes the serializer below ("Expected a `date`,
        # but got a `datetime`") — refresh to get the DB-coerced value.
        savings.refresh_from_db()
        member.total_savings = new_balance
        member.save()

    Notification.objects.create(
        recipient=member.user, notification_type="savings_credited",
        title=f"Savings {dj_type.title()} Recorded",
        message=f"₦{amount:,.2f} was {dj_type}ed to your account.",
    )
    return Response(SavingsTransactionSerializer(savings).data, status=201)


# ═══════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_notifications(request):
    """GET /api/notifications/"""
    if not request.user.is_authenticated:
        return Response([], status=200)
    notifs = Notification.objects.filter(recipient=request.user).order_by("-created_at")[:50]
    return Response(NotificationSerializer(notifs, many=True).data)


@api_view(["POST"])
def api_mark_notifications_read(request):
    """POST /api/notifications/read/"""
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return Response({"success": True})


# ═══════════════════════════════════════════════════════════════════════════
# ANNOUNCEMENTS  (stored as broadcast Notifications with type=general)
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET", "POST"])
def api_announcements(request):
    """GET/POST /api/announcements/"""
    if request.method == "POST":
        if not can_manage_members(request.user):
            return Response({"error": "Admin or Secretary only"}, status=403)
        title = request.data.get("title")
        body = request.data.get("body", "")
        priority = request.data.get("priority", "normal")
        # Broadcast to all members
        for m in Member.objects.filter(is_admin=False):
            Notification.objects.create(
                recipient=m.user, notification_type="general",
                title=title, message=body,
            )
        return Response({"success": True, "title": title}, status=201)

    # GET — return recent general notifications for this user as announcements
    notifs = Notification.objects.filter(
        notification_type="general"
    ).order_by("-created_at")[:50]
    data = [{
        "id": str(n.id), "title": n.title, "body": n.message,
        "priority": "normal", "created_by": None,
        "created_at": n.created_at.isoformat(),
    } for n in notifs]
    # De-duplicate by title
    seen, unique = set(), []
    for d in data:
        if d["title"] not in seen:
            seen.add(d["title"]); unique.append(d)
    return Response(unique)


# ═══════════════════════════════════════════════════════════════════════════
# AUDIT LOGS  (from Transaction records)
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_audit_logs(request):
    """GET /api/audit/"""
    if not can_read_reports(request.user):
        return Response({"error": "Admin, Treasurer, Secretary or Auditor only"}, status=403)
    txns = Transaction.objects.select_related("member__user", "performed_by").order_by("-date")[:100]
    return Response(AuditLogSerializer(txns, many=True).data)


# ═══════════════════════════════════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET", "PATCH"])
def api_settings(request):
    """GET/PATCH /api/settings/"""
    settings = CoopSettings.get_settings()
    if request.method == "PATCH":
        if not can_manage_finance(request.user):
            return Response({"error": "Admin or Treasurer only"}, status=403)
        ser = SettingsSerializer(settings, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
    return Response(SettingsSerializer(settings).data)


# ═══════════════════════════════════════════════════════════════════════════
# ML / INSIGHTS
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_ml_metrics(request):
    """GET /api/ml/metrics/"""
    if not is_model_trained():
        return Response({"trained": False})
    m = get_model_metrics()
    return Response({"trained": True, **{k: v for k, v in m.items() if k != "classification_report"}})


@api_view(["GET"])
def api_ml_predict(request, member_id):
    """GET /api/ml/predict/<member_id>/?amount=&tenure="""
    if not can_manage_finance(request.user):
        return Response({"error": "Admin or Treasurer only"}, status=403)
    try:
        member = Member.objects.get(member_id=member_id)
    except Member.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
    amount = float(request.GET.get("amount", 50000))
    tenure = int(request.GET.get("tenure", 12))
    features = compute_ml_features(member, amount, tenure)
    result = predict_default_risk(features)
    return Response(result)


@api_view(["POST"])
def api_ml_retrain(request):
    """POST /api/ml/retrain/"""
    if not is_full_admin(request.user):
        return Response({"error": "Admin only"}, status=403)
    metrics = train_model(n_samples=1200)
    return Response({"success": True, "accuracy": metrics["accuracy"],
                     "f1_score": metrics["f1_score"]})


@api_view(["GET"])
def api_dashboard_stats(request):
    """GET /api/stats/  — admin dashboard aggregates"""
    if not can_read_reports(request.user):
        return Response({"error": "Admin, Treasurer, Secretary or Auditor only"}, status=403)
    total_savings = Savings.objects.filter(transaction_type="deposit").aggregate(t=Sum("amount"))["t"] or 0
    total_wd = Savings.objects.filter(transaction_type="withdrawal").aggregate(t=Sum("amount"))["t"] or 0
    return Response({
        "total_members": Member.objects.count(),
        "active_members": Member.objects.filter(status="active").count(),
        "net_savings": float(total_savings - total_wd),
        "total_disbursed": float(Loan.objects.exclude(amount_approved=None).aggregate(t=Sum("amount_approved"))["t"] or 0),
        "total_repaid": float(Repayment.objects.filter(status="confirmed").aggregate(t=Sum("amount"))["t"] or 0),
        "pending_loans": Loan.objects.filter(status="pending").count(),
        "active_loans": Loan.objects.filter(status="active").count(),
        "overdue_loans": Loan.objects.filter(status="overdue").count(),
        "risk_distribution": {
            "Low": MLPrediction.objects.filter(risk_level="Low").count(),
            "Medium": MLPrediction.objects.filter(risk_level="Medium").count(),
            "High": MLPrediction.objects.filter(risk_level="High").count(),
        },
    })


# ═══════════════════════════════════════════════════════════════════════════
# BANK ACCOUNTS + REAL DEPOSITS / WITHDRAWALS (Paystack)
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET", "POST"])
def api_bank_accounts(request):
    """GET: list the member's linked bank accounts.
    POST {account_number, bank_code, bank_name}: verify via Paystack and link."""
    member = get_member(request.user)
    if member is None:
        return Response({"error": "Member profile not found"}, status=404)

    if request.method == "GET":
        accounts = BankAccount.objects.filter(member=member)
        return Response(BankAccountSerializer(accounts, many=True).data)

    account_number = request.data.get("account_number")
    bank_code = request.data.get("bank_code")
    bank_name = request.data.get("bank_name", "")
    if not account_number or not bank_code:
        return Response({"error": "account_number and bank_code are required"}, status=400)

    try:
        resolved = payments.resolve_account(account_number, bank_code)
    except payments.PaystackError as e:
        return Response({"error": str(e)}, status=400)

    account_name = resolved.get("account_name", "")
    account = BankAccount.objects.create(
        member=member,
        bank_code=bank_code,
        bank_name=bank_name,
        account_number=account_number,
        account_name=account_name,
        is_verified=True,
        is_default=not member.bank_accounts.exists(),
    )
    return Response(BankAccountSerializer(account).data, status=201)


@api_view(["GET", "POST"])
def api_exchange_rates(request):
    """GET: list rates (any authenticated user, e.g. to populate a currency
    selector). POST {currency_code, currency_name, rate_to_ngn}: admin-only
    create/update of a rate."""
    if request.method == "GET":
        rates = ExchangeRate.objects.all()
        return Response(ExchangeRateSerializer(rates, many=True).data)

    if not can_manage_finance(request.user):
        return Response({"error": "Admin or Treasurer only"}, status=403)

    code = (request.data.get("currency_code") or "").upper()
    name = request.data.get("currency_name", "")
    rate = request.data.get("rate_to_ngn")
    if not code or not rate:
        return Response({"error": "currency_code and rate_to_ngn are required"}, status=400)
    try:
        rate = Decimal(str(rate))
        if rate <= 0:
            raise ValueError
    except Exception:
        return Response({"error": "rate_to_ngn must be a positive number"}, status=400)

    obj, _ = ExchangeRate.objects.update_or_create(
        currency_code=code, defaults={"currency_name": name, "rate_to_ngn": rate},
    )
    return Response(ExchangeRateSerializer(obj).data, status=201)


@api_view(["DELETE"])
def api_exchange_rate_delete(request, currency_code):
    """DELETE /api/exchange-rates/<code>/  — Admin or Treasurer only."""
    if not can_manage_finance(request.user):
        return Response({"error": "Admin or Treasurer only"}, status=403)
    deleted, _ = ExchangeRate.objects.filter(currency_code=currency_code.upper()).delete()
    if not deleted:
        return Response({"error": "Not found"}, status=404)
    return Response(status=204)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def api_banks_list(request):
    """GET /api/banks/  — list of Nigerian banks for the bank-select dropdown."""
    try:
        banks = payments.list_banks()
    except payments.PaystackError as e:
        return Response({"error": str(e)}, status=400)
    return Response([{"name": b["name"], "code": b["code"]} for b in banks])


@api_view(["POST"])
def api_deposit_initialize(request):
    """POST /api/deposits/initialize/  {amount, currency}
    `amount` is in `currency` (default NGN). If a foreign currency is given,
    it's converted to Naira using the admin-configured ExchangeRate before
    being charged — Paystack (NGN merchant) always charges the Naira amount.
    Creates a pending Transaction and returns Paystack checkout data. The
    Transaction/Savings/Member balance are only finalized by the webhook."""
    member = get_member(request.user)
    if member is None:
        return Response({"error": "Member profile not found"}, status=404)

    currency = (request.data.get("currency") or "NGN").upper()
    try:
        entered_amount = Decimal(str(request.data.get("amount", 0)))
    except Exception:
        return Response({"error": "Invalid amount"}, status=400)
    if entered_amount <= 0:
        return Response({"error": "Amount must be greater than zero"}, status=400)

    if currency == "NGN":
        ngn_amount = entered_amount
    else:
        rate = ExchangeRate.objects.filter(currency_code=currency).first()
        if rate is None:
            return Response({"error": f"Unsupported currency: {currency}"}, status=400)
        ngn_amount = (entered_amount * rate.rate_to_ngn).quantize(Decimal("0.01"))

    reference = f"DEP-{uuid.uuid4().hex[:20]}"
    txn = Transaction.objects.create(
        member=member, transaction_type="bank_deposit", amount=ngn_amount,
        description=f"Bank deposit via Paystack ({entered_amount} {currency})" if currency != "NGN"
                    else "Bank deposit via Paystack",
        status="pending", paystack_reference=reference, performed_by=request.user,
        currency=currency, amount_original=entered_amount,
    )
    amount = ngn_amount
    try:
        init_data = payments.initialize_transaction(
            email=request.user.email, amount_naira=amount, reference=reference,
        )
    except payments.PaystackError as e:
        txn.status = "failed"
        txn.save(update_fields=["status"])
        return Response({"error": str(e)}, status=400)

    return Response({
        "transaction_id": txn.transaction_id,
        "reference": reference,
        "authorization_url": init_data.get("authorization_url"),
        "access_code": init_data.get("access_code"),
        "public_key": settings.PAYSTACK_PUBLIC_KEY,
        "amount_ngn": float(ngn_amount),
        "currency": currency,
        "amount_original": float(entered_amount),
    }, status=201)


@api_view(["POST"])
def api_withdrawal_initiate(request):
    """POST /api/withdrawals/  {bank_account_id, amount}
    Validates balance, starts a Paystack transfer, and creates a pending
    Transaction. Finalized only once the webhook confirms transfer.success."""
    member = get_member(request.user)
    if member is None:
        return Response({"error": "Member profile not found"}, status=404)

    bank_account_id = request.data.get("bank_account_id")
    try:
        amount = Decimal(str(request.data.get("amount", 0)))
    except Exception:
        return Response({"error": "Invalid amount"}, status=400)
    if amount <= 0:
        return Response({"error": "Amount must be greater than zero"}, status=400)
    if amount > member.total_savings:
        return Response({"error": "Insufficient balance"}, status=400)

    bank_account = BankAccount.objects.filter(id=bank_account_id, member=member, is_verified=True).first()
    if bank_account is None:
        return Response({"error": "Linked bank account not found"}, status=404)

    try:
        if not bank_account.paystack_recipient_code:
            recipient = payments.create_transfer_recipient(
                bank_account.account_number, bank_account.bank_code, bank_account.account_name,
            )
            bank_account.paystack_recipient_code = recipient["recipient_code"]
            bank_account.save(update_fields=["paystack_recipient_code"])

        reference = f"WD-{uuid.uuid4().hex[:20]}"
        # Reserve the funds immediately so a member can't withdraw the same
        # balance twice while a transfer is pending confirmation.
        member.total_savings = member.total_savings - amount
        member.save(update_fields=["total_savings"])

        txn = Transaction.objects.create(
            member=member, transaction_type="bank_withdrawal", amount=amount,
            description=f"Withdrawal to {bank_account.bank_name} ({bank_account.account_number})",
            status="pending", paystack_reference=reference,
            bank_account=bank_account, performed_by=request.user,
        )
        payments.initiate_transfer(bank_account.paystack_recipient_code, amount, reference)
    except payments.PaystackError as e:
        # Roll back the reservation if Paystack rejected the transfer outright.
        member.total_savings = member.total_savings + amount
        member.save(update_fields=["total_savings"])
        return Response({"error": str(e)}, status=400)

    return Response({"transaction_id": txn.transaction_id, "reference": reference, "status": "pending"}, status=201)


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
def api_paystack_webhook(request):
    """POST /api/paystack/webhook/ — source of truth for deposit/withdrawal state.
    Verifies Paystack's HMAC signature; never trusts client-reported success."""
    signature = request.headers.get("x-paystack-signature", "")
    if not payments.verify_webhook_signature(request.body, signature):
        return Response({"error": "Invalid signature"}, status=401)

    event = request.data.get("event", "")
    data = request.data.get("data", {})
    reference = data.get("reference", "")

    if event == "charge.success":
        txn = Transaction.objects.filter(paystack_reference=reference, transaction_type="bank_deposit").first()
        if txn and txn.status == "pending":
            try:
                verified = payments.verify_transaction(reference)
            except payments.PaystackError:
                return Response({"received": True})
            if verified.get("status") == "success":
                member = txn.member
                new_balance = member.total_savings + txn.amount
                Savings.objects.create(
                    member=member, amount=txn.amount, transaction_type="deposit",
                    balance_after=new_balance, description="Bank deposit via Paystack",
                )
                member.total_savings = new_balance
                member.save(update_fields=["total_savings"])
                txn.status = "success"
                txn.save(update_fields=["status"])
                Notification.objects.create(
                    recipient=member.user, notification_type="savings_credited",
                    title="Deposit Successful",
                    message=f"₦{txn.amount:,.2f} has been credited to your savings.",
                )

    elif event in ("transfer.success", "transfer.failed", "transfer.reversed"):
        txn = Transaction.objects.filter(paystack_reference=reference, transaction_type="bank_withdrawal").first()
        if txn and txn.status == "pending":
            if event == "transfer.success":
                Savings.objects.create(
                    member=txn.member, amount=txn.amount, transaction_type="withdrawal",
                    balance_after=txn.member.total_savings, description=txn.description,
                )
                txn.status = "success"
                Notification.objects.create(
                    recipient=txn.member.user, notification_type="savings_credited",
                    title="Withdrawal Successful",
                    message=f"₦{txn.amount:,.2f} has been sent to your bank account.",
                )
            else:
                # Refund the reserved balance since the transfer didn't go through.
                member = txn.member
                member.total_savings = member.total_savings + txn.amount
                member.save(update_fields=["total_savings"])
                txn.status = "failed"
                Notification.objects.create(
                    recipient=txn.member.user, notification_type="general",
                    title="Withdrawal Failed",
                    message=f"Your withdrawal of ₦{txn.amount:,.2f} failed and has been refunded to your balance.",
                )
            txn.save(update_fields=["status"])

    return Response({"received": True})


# ═══════════════════════════════════════════════════════════════════════════
# EXPORTS (PDF / Excel)
# ═══════════════════════════════════════════════════════════════════════════

@api_view(["GET"])
def api_export_savings_statement(request):
    """GET /api/exports/savings-statement/?member_id=
    Members download their own statement; Admin/Treasurer/Secretary/Auditor
    can pull any member's by passing ?member_id=."""
    member_id = request.GET.get("member_id")
    if member_id:
        if not can_read_reports(request.user):
            return Response({"error": "Admin, Treasurer, Secretary or Auditor only"}, status=403)
        try:
            member = Member.objects.get(member_id=member_id)
        except Member.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
    else:
        member = get_member(request.user)
        if member is None:
            return Response({"error": "Member profile not found"}, status=404)
    return exports.savings_statement_pdf(member)


@api_view(["GET"])
def api_export_financial_report(request):
    """GET /api/exports/financial-report/ — admin/treasurer/secretary/auditor."""
    if not can_read_reports(request.user):
        return Response({"error": "Admin, Treasurer, Secretary or Auditor only"}, status=403)
    transactions = Transaction.objects.select_related("member__user").order_by("-date")[:500]
    loans = Loan.objects.select_related("member__user").order_by("-application_date")[:500]
    savings_total = Savings.objects.filter(transaction_type="deposit").aggregate(t=Sum("amount"))["t"] or 0
    withdrawals_total = Savings.objects.filter(transaction_type="withdrawal").aggregate(t=Sum("amount"))["t"] or 0
    disbursed_total = Loan.objects.exclude(amount_approved=None).aggregate(t=Sum("amount_approved"))["t"] or 0
    repaid_total = Repayment.objects.filter(status="confirmed").aggregate(t=Sum("amount"))["t"] or 0
    return exports.financial_report_excel(
        transactions, loans, savings_total, withdrawals_total, disbursed_total, repaid_total,
    )
