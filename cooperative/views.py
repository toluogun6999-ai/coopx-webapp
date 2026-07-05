"""
CoopSys Views
=============
All views for authentication, admin dashboard, and member portal.
"""
import json
from decimal import Decimal
from datetime import date, timedelta

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from django.contrib import messages
from django.db.models import Sum, Count, Q, Avg
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.core.paginator import Paginator
from django.views.decorators.http import require_POST

from .models import (
    Member, Savings, Loan, Repayment, Contribution,
    Transaction, Notification, MLPrediction, CoopSettings
)
from .forms import (
    RegisterForm, LoginForm, MemberProfileForm, AdminAddMemberForm,
    SavingsForm, ContributionForm, LoanApplicationForm, LoanApprovalForm,
    RepaymentForm, CoopSettingsForm
)
from .ml.predictor import predict_default_risk, get_model_metrics, train_model, is_model_trained


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def is_admin(user):
    return user.is_authenticated and (user.is_staff or
           (hasattr(user, 'member_profile') and user.member_profile.is_admin))


def admin_required(view_func):
    decorated = user_passes_test(is_admin, login_url='/auth/login/')(view_func)
    return login_required(decorated)


def send_notification(recipient, notif_type, title, message, action_url=''):
    Notification.objects.create(
        recipient=recipient, notification_type=notif_type,
        title=title, message=message, action_url=action_url
    )


def log_transaction(member, txn_type, amount, description, reference_id='', user=None):
    Transaction.objects.create(
        member=member, transaction_type=txn_type, amount=amount,
        description=description, reference_id=reference_id,
        performed_by=user
    )


# ─── PUBLIC VIEWS ─────────────────────────────────────────────────────────────

def home(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    settings_obj = CoopSettings.get_settings()
    stats = {
        'total_members': Member.objects.filter(status='active').count(),
        'total_savings': Savings.objects.filter(transaction_type='deposit').aggregate(
            t=Sum('amount'))['t'] or 0,
        'total_loans': Loan.objects.filter(status__in=['active', 'repaid']).count(),
    }
    return render(request, 'public/home.html', {'stats': stats, 'settings': settings_obj})


def about(request):
    return render(request, 'public/about.html')


def contact(request):
    return render(request, 'public/contact.html')


# ─── AUTH VIEWS ──────────────────────────────────────────────────────────────

def register(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    form = RegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save(commit=False)
        user.first_name = form.cleaned_data['first_name']
        user.last_name = form.cleaned_data['last_name']
        user.email = form.cleaned_data['email']
        user.save()
        Member.objects.create(
            user=user,
            phone=form.cleaned_data['phone'],
            gender=form.cleaned_data['gender'],
            address=form.cleaned_data['address'],
            occupation=form.cleaned_data.get('occupation', ''),
            monthly_income=form.cleaned_data.get('monthly_income', 0),
        )
        send_notification(user, 'general', 'Welcome to CoopSys!',
                          f'Dear {user.first_name}, your account has been successfully created. '
                          f'You can now access all cooperative services.')
        login(request, user)
        messages.success(request, f'Welcome, {user.first_name}! Your account has been created.')
        return redirect('dashboard')
    return render(request, 'auth/register.html', {'form': form})


def user_login(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    form = LoginForm(request, data=request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.get_user()
        login(request, user)
        next_url = request.GET.get('next', 'dashboard')
        messages.success(request, f'Welcome back, {user.first_name or user.username}!')
        return redirect(next_url)
    return render(request, 'auth/login.html', {'form': form})


@login_required
def user_logout(request):
    logout(request)
    messages.info(request, 'You have been signed out successfully.')
    return redirect('login')


# ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────

@login_required
def dashboard(request):
    if is_admin(request.user):
        return redirect('admin_dashboard')
    return redirect('member_dashboard')


# ─── ADMIN VIEWS ─────────────────────────────────────────────────────────────

@admin_required
def admin_dashboard(request):
    # Core stats
    total_members = Member.objects.count()
    active_members = Member.objects.filter(status='active').count()
    total_savings = Savings.objects.filter(transaction_type='deposit').aggregate(
        total=Sum('amount'))['total'] or 0
    total_withdrawals = Savings.objects.filter(transaction_type='withdrawal').aggregate(
        total=Sum('amount'))['total'] or 0
    net_savings = total_savings - total_withdrawals

    active_loans = Loan.objects.filter(status='active')
    overdue_loans = Loan.objects.filter(status='overdue')
    pending_loans = Loan.objects.filter(status='pending')
    total_disbursed = Loan.objects.filter(status__in=['active', 'overdue', 'repaid']).aggregate(
        total=Sum('amount_approved'))['total'] or 0
    total_repaid = Repayment.objects.filter(status='confirmed').aggregate(
        total=Sum('amount'))['total'] or 0
    total_contributions = Contribution.objects.aggregate(total=Sum('amount'))['total'] or 0

    # Monthly savings chart data (last 6 months)
    savings_chart = []
    for i in range(5, -1, -1):
        month_date = timezone.now().date().replace(day=1) - timedelta(days=i * 30)
        month_savings = Savings.objects.filter(
            transaction_type='deposit',
            date__year=month_date.year,
            date__month=month_date.month
        ).aggregate(total=Sum('amount'))['total'] or 0
        savings_chart.append({
            'month': month_date.strftime('%b %Y'),
            'amount': float(month_savings),
        })

    # Loan status distribution
    loan_stats = {
        'pending': Loan.objects.filter(status='pending').count(),
        'active': Loan.objects.filter(status='active').count(),
        'overdue': Loan.objects.filter(status='overdue').count(),
        'repaid': Loan.objects.filter(status='repaid').count(),
    }

    # Risk distribution from ML predictions
    risk_dist = {
        'Low': MLPrediction.objects.filter(risk_level='Low').count(),
        'Medium': MLPrediction.objects.filter(risk_level='Medium').count(),
        'High': MLPrediction.objects.filter(risk_level='High').count(),
    }

    # Recent activities
    recent_loans = Loan.objects.select_related('member__user').order_by('-created_at')[:6]
    recent_savings = Savings.objects.select_related('member__user').order_by('-created_at')[:6]
    recent_predictions = MLPrediction.objects.select_related('member__user').order_by('-prediction_date')[:5]

    # Member growth chart (last 6 months)
    member_chart = []
    for i in range(5, -1, -1):
        month_date = timezone.now().date().replace(day=1) - timedelta(days=i * 30)
        count = Member.objects.filter(
            join_date__year=month_date.year,
            join_date__month=month_date.month
        ).count()
        member_chart.append({'month': month_date.strftime('%b'), 'count': count})

    ctx = {
        'total_members': total_members,
        'active_members': active_members,
        'net_savings': net_savings,
        'total_disbursed': total_disbursed,
        'total_repaid': total_repaid,
        'total_contributions': total_contributions,
        'active_loans_count': active_loans.count(),
        'overdue_loans_count': overdue_loans.count(),
        'pending_loans_count': pending_loans.count(),
        'savings_chart_json': json.dumps(savings_chart),
        'loan_stats_json': json.dumps(loan_stats),
        'risk_dist_json': json.dumps(risk_dist),
        'member_chart_json': json.dumps(member_chart),
        'recent_loans': recent_loans,
        'recent_savings': recent_savings,
        'recent_predictions': recent_predictions,
        'model_trained': is_model_trained(),
    }
    return render(request, 'admin/dashboard.html', ctx)


# ─── MEMBERS MANAGEMENT ──────────────────────────────────────────────────────

@admin_required
def admin_members(request):
    search = request.GET.get('q', '')
    status_filter = request.GET.get('status', '')
    qs = Member.objects.select_related('user').all()
    if search:
        qs = qs.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(member_id__icontains=search) |
            Q(user__email__icontains=search)
        )
    if status_filter:
        qs = qs.filter(status=status_filter)
    paginator = Paginator(qs, 15)
    members = paginator.get_page(request.GET.get('page'))
    form = AdminAddMemberForm()
    if request.method == 'POST' and 'add_member' in request.POST:
        form = AdminAddMemberForm(request.POST)
        if form.is_valid():
            user = User.objects.create_user(
                username=form.cleaned_data['username'],
                email=form.cleaned_data['email'],
                password=form.cleaned_data['password'],
                first_name=form.cleaned_data['first_name'],
                last_name=form.cleaned_data['last_name'],
            )
            Member.objects.create(
                user=user,
                phone=form.cleaned_data['phone'],
                gender=form.cleaned_data['gender'],
                address=form.cleaned_data['address'],
                monthly_income=form.cleaned_data['monthly_income'],
            )
            messages.success(request, f'Member {user.get_full_name()} added successfully.')
            return redirect('admin_members')
    return render(request, 'admin/members.html', {
        'members': members, 'form': form, 'search': search, 'status_filter': status_filter
    })


@admin_required
def admin_member_detail(request, member_id):
    member = get_object_or_404(Member, member_id=member_id)
    if request.method == 'POST' and 'update_status' in request.POST:
        new_status = request.POST.get('status')
        if new_status in ['active', 'inactive', 'suspended']:
            member.status = new_status
            member.save()
            messages.success(request, f"Member status updated to {new_status}.")
            return redirect('admin_member_detail', member_id=member_id)
    loans = Loan.objects.filter(member=member).order_by('-application_date')
    savings = Savings.objects.filter(member=member).order_by('-date')[:10]
    contributions = Contribution.objects.filter(member=member).order_by('-date')[:10]
    predictions = MLPrediction.objects.filter(member=member).order_by('-prediction_date')[:5]
    return render(request, 'admin/member_detail.html', {
        'member': member, 'loans': loans, 'savings': savings,
        'contributions': contributions, 'predictions': predictions,
    })


# ─── SAVINGS MANAGEMENT ──────────────────────────────────────────────────────

@admin_required
def admin_savings(request):
    form = SavingsForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        savings = form.save(commit=False)
        savings.recorded_by = request.user
        # Recalculate running balance
        member = savings.member
        last_balance = member.total_savings
        if savings.transaction_type == 'deposit':
            new_balance = last_balance + savings.amount
        else:
            new_balance = max(0, last_balance - savings.amount)
        savings.balance_after = new_balance
        savings.save()
        # Update member total
        member.total_savings = new_balance
        member.save()
        # Log transaction
        log_transaction(member, f'savings_{savings.transaction_type}',
                        savings.amount, f'Savings {savings.transaction_type}',
                        savings.transaction_id, request.user)
        send_notification(member.user, 'savings_credited',
                          f'Savings {savings.transaction_type.title()} Recorded',
                          f'₦{savings.amount:,.2f} has been {savings.transaction_type}ed to your account.')
        messages.success(request, 'Savings record added successfully.')
        return redirect('admin_savings')

    qs = Savings.objects.select_related('member__user').order_by('-date')
    search = request.GET.get('q', '')
    if search:
        qs = qs.filter(Q(member__user__first_name__icontains=search) |
                       Q(member__member_id__icontains=search))
    paginator = Paginator(qs, 15)
    savings_records = paginator.get_page(request.GET.get('page'))
    total = Savings.objects.filter(transaction_type='deposit').aggregate(t=Sum('amount'))['t'] or 0
    return render(request, 'admin/savings.html', {
        'form': form, 'savings_records': savings_records,
        'total': total, 'search': search,
    })


# ─── LOANS MANAGEMENT ────────────────────────────────────────────────────────

@admin_required
def admin_loans(request):
    status_filter = request.GET.get('status', '')
    search = request.GET.get('q', '')
    qs = Loan.objects.select_related('member__user').order_by('-application_date')
    if status_filter:
        qs = qs.filter(status=status_filter)
    if search:
        qs = qs.filter(Q(member__user__first_name__icontains=search) |
                       Q(loan_id__icontains=search) |
                       Q(member__member_id__icontains=search))
    paginator = Paginator(qs, 12)
    loans = paginator.get_page(request.GET.get('page'))
    return render(request, 'admin/loans.html', {
        'loans': loans, 'status_filter': status_filter, 'search': search,
        'pending_count': Loan.objects.filter(status='pending').count(),
        'active_count': Loan.objects.filter(status='active').count(),
        'overdue_count': Loan.objects.filter(status='overdue').count(),
    })


@admin_required
def admin_loan_detail(request, loan_id):
    loan = get_object_or_404(Loan, loan_id=loan_id)
    approval_form = LoanApprovalForm(request.POST or None, instance=loan)
    repayment_form = RepaymentForm()
    # Auto-run ML prediction
    prediction = None
    if loan.status == 'pending' or not loan.risk_score:
        try:
            member = loan.member
            total_loans = Loan.objects.filter(member=member).count()
            defaults = Loan.objects.filter(member=member, status='overdue').count()
            contrib_total = Contribution.objects.filter(member=member).count()
            contrib_paid = Contribution.objects.filter(member=member, is_paid=True).count()
            consistency = (contrib_paid / contrib_total) if contrib_total > 0 else 0.5
            rep_history = Repayment.objects.filter(loan__member=member)
            on_time = rep_history.filter(is_late=False).count()
            rep_score = (on_time / rep_history.count() * 100) if rep_history.count() > 0 else 50

            features = {
                'savings_balance': float(member.total_savings),
                'loan_amount': float(loan.amount_requested),
                'months_as_member': member.months_as_member,
                'previous_defaults': defaults,
                'contribution_consistency': consistency,
                'monthly_income': float(member.monthly_income),
                'tenure_months': loan.tenure_months,
                'repayment_history_score': rep_score,
            }
            prediction = predict_default_risk(features)
            # Save prediction
            MLPrediction.objects.create(
                member=member, loan=loan,
                risk_level=prediction['risk_level'],
                default_probability=prediction['default_probability'] / 100,
                savings_balance=member.total_savings,
                loan_amount=loan.amount_requested,
                months_as_member=member.months_as_member,
                previous_defaults=defaults,
                contribution_consistency=consistency,
                repayment_history_score=rep_score,
                feature_importances=prediction.get('feature_analysis'),
            )
            # Update loan risk
            loan.risk_score = prediction['risk_level']
            loan.risk_probability = prediction['default_probability'] / 100
            loan.save()
        except Exception as e:
            prediction = None

    if request.method == 'POST' and 'approve_loan' in request.POST:
        if approval_form.is_valid():
            updated_loan = approval_form.save(commit=False)
            if updated_loan.status == 'active':
                updated_loan.approval_date = date.today()
                updated_loan.approved_by = request.user
                log_transaction(loan.member, 'loan_disbursement',
                                updated_loan.amount_approved or loan.amount_requested,
                                f'Loan disbursement — {loan.loan_id}', loan.loan_id, request.user)
                send_notification(loan.member.user, 'loan_approved', 'Loan Approved & Disbursed!',
                                  f'Your loan {loan.loan_id} of ₦{updated_loan.amount_approved:,.2f} has been approved and disbursed.',
                                  f'/member/loans/')
            elif updated_loan.status == 'rejected':
                send_notification(loan.member.user, 'loan_rejected', 'Loan Application Rejected',
                                  f'Your loan application {loan.loan_id} was not approved. Reason: {updated_loan.rejection_reason}')
            updated_loan.save()
            messages.success(request, f'Loan {loan.loan_id} updated successfully.')
            return redirect('admin_loan_detail', loan_id=loan_id)

    if request.method == 'POST' and 'add_repayment' in request.POST:
        repayment_form = RepaymentForm(request.POST)
        if repayment_form.is_valid():
            repayment = repayment_form.save(commit=False)
            repayment.loan = loan
            repayment.recorded_by = request.user
            repayment.installment_number = loan.repayments.count() + 1
            repayment.save()
            # Check if loan is fully repaid
            if loan.outstanding_balance <= 0:
                loan.status = 'repaid'
                loan.save()
            log_transaction(loan.member, 'loan_repayment', repayment.amount,
                            f'Repayment for {loan.loan_id}', loan.loan_id, request.user)
            send_notification(loan.member.user, 'repayment_confirmed', 'Repayment Confirmed',
                              f'Your repayment of ₦{repayment.amount:,.2f} for loan {loan.loan_id} has been confirmed.')
            messages.success(request, 'Repayment recorded successfully.')
            return redirect('admin_loan_detail', loan_id=loan_id)

    repayments = Repayment.objects.filter(loan=loan).order_by('-payment_date')
    return render(request, 'admin/loan_detail.html', {
        'loan': loan, 'approval_form': approval_form,
        'repayment_form': repayment_form, 'repayments': repayments,
        'prediction': prediction,
    })


# ─── ML ANALYTICS ────────────────────────────────────────────────────────────

@admin_required
def admin_analytics(request):
    metrics = {}
    if is_model_trained():
        metrics = get_model_metrics()

    if request.method == 'POST' and 'train_model' in request.POST:
        try:
            metrics = train_model()
            messages.success(request, f'Model retrained successfully! Accuracy: {metrics["accuracy"]}%')
        except Exception as e:
            messages.error(request, f'Training failed: {str(e)}')
        return redirect('admin_analytics')

    predictions = MLPrediction.objects.select_related('member__user').order_by('-prediction_date')[:20]
    risk_summary = {
        'Low': MLPrediction.objects.filter(risk_level='Low').count(),
        'Medium': MLPrediction.objects.filter(risk_level='Medium').count(),
        'High': MLPrediction.objects.filter(risk_level='High').count(),
    }

    # Prediction trend over time
    trend_data = []
    for i in range(5, -1, -1):
        month_date = timezone.now().date().replace(day=1) - timedelta(days=i * 30)
        c = MLPrediction.objects.filter(
            prediction_date__year=month_date.year,
            prediction_date__month=month_date.month
        ).count()
        trend_data.append({'month': month_date.strftime('%b'), 'count': c})

    return render(request, 'admin/analytics.html', {
        'metrics': metrics,
        'predictions': predictions,
        'risk_summary': risk_summary,
        'model_trained': is_model_trained(),
        'trend_json': json.dumps(trend_data),
        'risk_json': json.dumps(risk_summary),
        'fi_json': json.dumps(metrics.get('feature_importances', {})),
    })


@admin_required
def admin_run_prediction(request, member_id):
    """Run ML prediction for a specific member applying for a loan."""
    member = get_object_or_404(Member, member_id=member_id)
    loan_amount = float(request.GET.get('loan_amount', 50000))
    tenure = int(request.GET.get('tenure', 12))

    defaults = Loan.objects.filter(member=member, status='overdue').count()
    contrib_total = Contribution.objects.filter(member=member).count()
    contrib_paid = Contribution.objects.filter(member=member, is_paid=True).count()
    consistency = (contrib_paid / contrib_total) if contrib_total > 0 else 0.5
    rep_history = Repayment.objects.filter(loan__member=member)
    on_time = rep_history.filter(is_late=False).count()
    rep_score = (on_time / rep_history.count() * 100) if rep_history.count() > 0 else 50

    features = {
        'savings_balance': float(member.total_savings),
        'loan_amount': loan_amount,
        'months_as_member': member.months_as_member,
        'previous_defaults': defaults,
        'contribution_consistency': consistency,
        'monthly_income': float(member.monthly_income),
        'tenure_months': tenure,
        'repayment_history_score': rep_score,
    }
    result = predict_default_risk(features)
    return JsonResponse(result)


# ─── REPORTS ─────────────────────────────────────────────────────────────────

@admin_required
def admin_reports(request):
    # Summary stats
    total_savings = Savings.objects.filter(transaction_type='deposit').aggregate(t=Sum('amount'))['t'] or 0
    total_withdrawals = Savings.objects.filter(transaction_type='withdrawal').aggregate(t=Sum('amount'))['t'] or 0
    total_contributions = Contribution.objects.aggregate(t=Sum('amount'))['t'] or 0
    total_disbursed = Loan.objects.exclude(status='pending').aggregate(t=Sum('amount_approved'))['t'] or 0
    total_repaid = Repayment.objects.filter(status='confirmed').aggregate(t=Sum('amount'))['t'] or 0

    # Monthly savings trend
    monthly_data = []
    for i in range(11, -1, -1):
        d = timezone.now().date().replace(day=1) - timedelta(days=i * 30)
        s = Savings.objects.filter(transaction_type='deposit', date__year=d.year, date__month=d.month)
        monthly_data.append({
            'month': d.strftime('%b %Y'),
            'savings': float(s.aggregate(t=Sum('amount'))['t'] or 0),
        })

    ctx = {
        'total_savings': total_savings,
        'total_withdrawals': total_withdrawals,
        'total_contributions': total_contributions,
        'total_disbursed': total_disbursed,
        'total_repaid': total_repaid,
        'net_pool': (total_savings - total_withdrawals),
        'monthly_json': json.dumps(monthly_data),
        'members_count': Member.objects.count(),
        'active_loans': Loan.objects.filter(status='active').count(),
        'overdue_loans': Loan.objects.filter(status='overdue').count(),
    }
    return render(request, 'admin/reports.html', ctx)


@admin_required
def admin_settings(request):
    settings_obj = CoopSettings.get_settings()
    form = CoopSettingsForm(request.POST or None, request.FILES or None, instance=settings_obj)
    if request.method == 'POST' and form.is_valid():
        form.save()
        messages.success(request, 'Settings updated successfully.')
        return redirect('admin_settings')
    return render(request, 'admin/settings.html', {'form': form, 'settings': settings_obj})


# ─── MEMBER VIEWS ─────────────────────────────────────────────────────────────

@login_required
def member_dashboard(request):
    try:
        member = request.user.member_profile
    except Member.DoesNotExist:
        messages.error(request, 'Member profile not found.')
        return redirect('login')

    if is_admin(request.user):
        return redirect('admin_dashboard')

    savings = Savings.objects.filter(member=member).order_by('-date')[:5]
    loans = Loan.objects.filter(member=member).order_by('-application_date')
    active_loan = loans.filter(status='active').first()
    recent_transactions = Transaction.objects.filter(member=member).order_by('-date')[:8]
    notifications = Notification.objects.filter(recipient=request.user, is_read=False)[:5]

    # Savings chart for member (last 6 months)
    savings_chart = []
    for i in range(5, -1, -1):
        d = timezone.now().date().replace(day=1) - timedelta(days=i * 30)
        s = Savings.objects.filter(
            member=member, transaction_type='deposit',
            date__year=d.year, date__month=d.month
        ).aggregate(t=Sum('amount'))['t'] or 0
        savings_chart.append({'month': d.strftime('%b'), 'amount': float(s)})

    # Loan eligibility
    settings_obj = CoopSettings.get_settings()
    max_loan = float(member.total_savings) * float(settings_obj.max_loan_multiplier)
    eligible = (float(member.total_savings) >= float(settings_obj.min_savings_for_loan) and
                member.months_as_member >= settings_obj.min_months_for_loan)

    ctx = {
        'member': member,
        'savings': savings,
        'loans': loans,
        'active_loan': active_loan,
        'recent_transactions': recent_transactions,
        'notifications': notifications,
        'savings_chart_json': json.dumps(savings_chart),
        'max_loan': max_loan,
        'is_eligible': eligible,
        'unread_count': Notification.objects.filter(recipient=request.user, is_read=False).count(),
    }
    return render(request, 'member/dashboard.html', ctx)


@login_required
def member_profile(request):
    member = get_object_or_404(Member, user=request.user)
    form = MemberProfileForm(request.POST or None, request.FILES or None, instance=member)
    if request.method == 'POST' and form.is_valid():
        form.save()
        messages.success(request, 'Profile updated successfully.')
        return redirect('member_profile')
    return render(request, 'member/profile.html', {'member': member, 'form': form})


@login_required
def member_savings(request):
    member = get_object_or_404(Member, user=request.user)
    savings = Savings.objects.filter(member=member).order_by('-date')
    contributions = Contribution.objects.filter(member=member).order_by('-date')
    paginator = Paginator(savings, 10)
    page_savings = paginator.get_page(request.GET.get('page'))
    total_deposited = savings.filter(transaction_type='deposit').aggregate(t=Sum('amount'))['t'] or 0
    total_withdrawn = savings.filter(transaction_type='withdrawal').aggregate(t=Sum('amount'))['t'] or 0
    return render(request, 'member/savings.html', {
        'member': member, 'page_savings': page_savings,
        'contributions': contributions[:10],
        'total_deposited': total_deposited,
        'total_withdrawn': total_withdrawn,
        'net_savings': total_deposited - total_withdrawn,
    })


@login_required
def member_loans(request):
    member = get_object_or_404(Member, user=request.user)
    settings_obj = CoopSettings.get_settings()
    max_loan = float(member.total_savings) * float(settings_obj.max_loan_multiplier)
    eligible = (float(member.total_savings) >= float(settings_obj.min_savings_for_loan) and
                member.months_as_member >= settings_obj.min_months_for_loan)

    form = LoanApplicationForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        if not eligible:
            messages.error(request, 'You are not eligible to apply for a loan at this time.')
            return redirect('member_loans')
        existing_active = Loan.objects.filter(member=member, status__in=['active', 'overdue', 'pending'])
        if existing_active.exists():
            messages.error(request, 'You have an existing active or pending loan. Please settle it before applying for a new one.')
            return redirect('member_loans')
        loan = form.save(commit=False)
        loan.member = member
        loan.interest_rate = settings_obj.default_interest_rate
        loan.save()
        send_notification(
            User.objects.filter(is_staff=True).first(),
            'general', f'New Loan Application: {loan.loan_id}',
            f'{member.full_name} has applied for a loan of ₦{loan.amount_requested:,.2f}.',
            f'/admin-panel/loans/{loan.loan_id}/'
        )
        messages.success(request, f'Loan application {loan.loan_id} submitted successfully!')
        return redirect('member_loans')

    loans = Loan.objects.filter(member=member).order_by('-application_date')
    return render(request, 'member/loans.html', {
        'member': member, 'loans': loans, 'form': form,
        'max_loan': max_loan, 'is_eligible': eligible,
        'settings': settings_obj,
    })


@login_required
def member_notifications(request):
    member = get_object_or_404(Member, user=request.user)
    notifications = Notification.objects.filter(recipient=request.user).order_by('-created_at')
    # Mark all as read
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    paginator = Paginator(notifications, 15)
    page_notifs = paginator.get_page(request.GET.get('page'))
    return render(request, 'member/notifications.html', {
        'member': member, 'page_notifs': page_notifs,
    })


@login_required
def member_transactions(request):
    member = get_object_or_404(Member, user=request.user)
    transactions = Transaction.objects.filter(member=member).order_by('-date')
    paginator = Paginator(transactions, 15)
    page_txns = paginator.get_page(request.GET.get('page'))
    return render(request, 'member/transactions.html', {
        'member': member, 'page_txns': page_txns,
    })
