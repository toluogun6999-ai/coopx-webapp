"""
CoopSys Models
==============
Defines all database tables for the Cooperative Society Management System.
"""
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
import uuid


# ─── MEMBER PROFILE ──────────────────────────────────────────────────────────

class Member(models.Model):
    """Extended profile for cooperative members."""

    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other')]
    STATUS_CHOICES = [('active', 'Active'), ('inactive', 'Inactive'), ('suspended', 'Suspended')]
    EMPLOYMENT_CHOICES = [
        ('civil_servant', 'Civil Servant'),
        ('private', 'Private Sector'),
        ('self_employed', 'Self Employed'),
        ('student', 'Student'),
        ('retired', 'Retired'),
        ('other', 'Other'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='member_profile')
    member_id = models.CharField(max_length=20, unique=True, editable=False)
    phone = models.CharField(max_length=15)
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES)
    date_of_birth = models.DateField(null=True, blank=True)
    address = models.TextField()
    occupation = models.CharField(max_length=100, blank=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_CHOICES, default='other')
    monthly_income = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    next_of_kin = models.CharField(max_length=100, blank=True)
    next_of_kin_phone = models.CharField(max_length=15, blank=True)
    profile_photo = models.ImageField(upload_to='profiles/', null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    is_admin = models.BooleanField(default=False)
    join_date = models.DateField(default=timezone.now)
    total_savings = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_contributions = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-join_date']
        verbose_name = 'Member'
        verbose_name_plural = 'Members'

    def save(self, *args, **kwargs):
        if not self.member_id:
            count = Member.objects.count() + 1
            self.member_id = f"CSC-{str(count).zfill(4)}"
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f"{self.user.first_name} {self.user.last_name}"

    @property
    def active_loans(self):
        return self.loan_set.filter(status__in=['active', 'overdue']).count()

    @property
    def outstanding_loan_balance(self):
        loans = self.loan_set.filter(status__in=['active', 'overdue'])
        return sum(l.outstanding_balance for l in loans)

    @property
    def months_as_member(self):
        delta = timezone.now().date() - self.join_date
        return max(1, delta.days // 30)

    def __str__(self):
        return f"{self.member_id} — {self.full_name}"


# ─── SAVINGS ─────────────────────────────────────────────────────────────────

class Savings(models.Model):
    """Individual savings record for a member."""

    TRANSACTION_TYPE = [
        ('deposit', 'Deposit'),
        ('withdrawal', 'Withdrawal'),
        ('dividend', 'Dividend Credit'),
    ]

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='savings_records')
    transaction_id = models.CharField(max_length=20, unique=True, editable=False)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    transaction_type = models.CharField(max_length=15, choices=TRANSACTION_TYPE, default='deposit')
    balance_after = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    description = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='savings_recorded')
    date = models.DateField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name = 'Savings Record'
        verbose_name_plural = 'Savings Records'

    def save(self, *args, **kwargs):
        if not self.transaction_id:
            count = Savings.objects.count() + 1
            self.transaction_id = f"SAV-{timezone.now().strftime('%Y%m')}-{str(count).zfill(4)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.transaction_id} | {self.member.member_id} | ₦{self.amount:,.2f}"


# ─── CONTRIBUTIONS ────────────────────────────────────────────────────────────

class Contribution(models.Model):
    """Monthly/periodic contributions from members."""

    FREQ_CHOICES = [
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('annual', 'Annual'),
        ('special', 'Special Levy'),
    ]

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='contributions')
    contribution_id = models.CharField(max_length=20, unique=True, editable=False)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    frequency = models.CharField(max_length=15, choices=FREQ_CHOICES, default='monthly')
    period = models.CharField(max_length=20, help_text="e.g. May 2025")
    description = models.CharField(max_length=255, blank=True)
    is_paid = models.BooleanField(default=True)
    date = models.DateField(default=timezone.now)
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def save(self, *args, **kwargs):
        if not self.contribution_id:
            count = Contribution.objects.count() + 1
            self.contribution_id = f"CON-{timezone.now().strftime('%Y%m')}-{str(count).zfill(4)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.contribution_id} | {self.member.full_name} | {self.period}"


# ─── LOANS ───────────────────────────────────────────────────────────────────

class Loan(models.Model):
    """Loan application and tracking."""

    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('active', 'Active / Disbursed'),
        ('overdue', 'Overdue'),
        ('repaid', 'Fully Repaid'),
        ('rejected', 'Rejected'),
        ('cancelled', 'Cancelled'),
    ]
    PURPOSE_CHOICES = [
        ('business', 'Business Expansion'),
        ('education', 'Education / School Fees'),
        ('medical', 'Medical Expenses'),
        ('housing', 'Housing / Renovation'),
        ('agriculture', 'Agriculture'),
        ('personal', 'Personal / Emergency'),
        ('other', 'Other'),
    ]

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='loan_set')
    loan_id = models.CharField(max_length=20, unique=True, editable=False)
    amount_requested = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(1000)])
    amount_approved = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, default=10.00,
                                        help_text="Annual interest rate (%)")
    tenure_months = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(60)],
                                        help_text="Loan duration in months")
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default='personal')
    purpose_description = models.TextField(blank=True)
    guarantor_name = models.CharField(max_length=100, blank=True)
    guarantor_phone = models.CharField(max_length=15, blank=True)
    guarantor_member_id = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    application_date = models.DateField(default=timezone.now)
    approval_date = models.DateField(null=True, blank=True)
    disbursement_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='loans_approved')
    rejection_reason = models.TextField(blank=True)
    # ML prediction
    risk_score = models.CharField(max_length=10, blank=True,
                                  choices=[('Low', 'Low Risk'), ('Medium', 'Medium Risk'), ('High', 'High Risk')])
    risk_probability = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-application_date']

    def save(self, *args, **kwargs):
        if not self.loan_id:
            count = Loan.objects.count() + 1
            self.loan_id = f"LN-{timezone.now().strftime('%Y')}-{str(count).zfill(4)}"
        super().save(*args, **kwargs)

    @property
    def monthly_emi(self):
        """Calculate Equated Monthly Installment."""
        if not self.amount_approved:
            return 0
        P = float(self.amount_approved)
        r = float(self.interest_rate) / 100 / 12
        n = self.tenure_months
        if r == 0:
            return P / n
        emi = P * r * (1 + r) ** n / ((1 + r) ** n - 1)
        return round(emi, 2)

    @property
    def total_repayable(self):
        return self.monthly_emi * self.tenure_months if self.amount_approved else 0

    @property
    def total_repaid(self):
        return sum(r.amount for r in self.repayments.filter(status='confirmed'))

    @property
    def outstanding_balance(self):
        return max(0, float(self.total_repayable) - float(self.total_repaid))

    @property
    def repayment_percentage(self):
        if self.total_repayable <= 0:
            return 0
        return min(100, round((float(self.total_repaid) / float(self.total_repayable)) * 100, 1))

    def __str__(self):
        return f"{self.loan_id} | {self.member.full_name} | ₦{self.amount_requested:,.2f}"


# ─── REPAYMENTS ──────────────────────────────────────────────────────────────

class Repayment(models.Model):
    """Individual loan repayment installments."""

    STATUS_CHOICES = [('pending', 'Pending'), ('confirmed', 'Confirmed'), ('failed', 'Failed')]

    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='repayments')
    repayment_id = models.CharField(max_length=20, unique=True, editable=False)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    payment_date = models.DateField(default=timezone.now)
    installment_number = models.IntegerField(default=1)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='confirmed')
    is_late = models.BooleanField(default=False)
    penalty_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=50, default='Cash', blank=True)
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        if not self.repayment_id:
            count = Repayment.objects.count() + 1
            self.repayment_id = f"REP-{timezone.now().strftime('%Y%m')}-{str(count).zfill(4)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.repayment_id} | {self.loan.loan_id} | ₦{self.amount:,.2f}"


# ─── ML PREDICTION LOG ────────────────────────────────────────────────────────

class MLPrediction(models.Model):
    """Logs all ML loan default predictions."""

    RISK_CHOICES = [('Low', 'Low Risk'), ('Medium', 'Medium Risk'), ('High', 'High Risk')]
    ALGO_CHOICES = [
        ('random_forest', 'Random Forest'),
        ('logistic_regression', 'Logistic Regression'),
        ('decision_tree', 'Decision Tree'),
    ]

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='predictions')
    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, null=True, blank=True)
    prediction_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    risk_level = models.CharField(max_length=10, choices=RISK_CHOICES)
    default_probability = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    algorithm_used = models.CharField(max_length=25, choices=ALGO_CHOICES, default='random_forest')
    # Feature values used
    savings_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    months_as_member = models.IntegerField(default=0)
    previous_defaults = models.IntegerField(default=0)
    contribution_consistency = models.FloatField(default=0)
    debt_to_savings_ratio = models.FloatField(default=0)
    repayment_history_score = models.FloatField(default=0)
    # Feature importances JSON
    feature_importances = models.JSONField(null=True, blank=True)
    prediction_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-prediction_date']

    def __str__(self):
        return f"{self.member.full_name} — {self.risk_level} ({self.default_probability:.2%})"


# ─── BANK ACCOUNTS (Paystack) ─────────────────────────────────────────────────

class BankAccount(models.Model):
    """A member's linked real-world bank account (verified via Paystack)."""

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='bank_accounts')
    bank_code = models.CharField(max_length=10)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    account_name = models.CharField(max_length=150, help_text="Name returned by Paystack account resolution")
    paystack_recipient_code = models.CharField(max_length=50, blank=True,
                                               help_text="Used for withdrawals via Paystack Transfers")
    is_verified = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', '-created_at']
        unique_together = ('member', 'account_number', 'bank_code')

    def save(self, *args, **kwargs):
        if self.is_default:
            BankAccount.objects.filter(member=self.member).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.account_name} — {self.bank_name} ({self.account_number})"


# ─── TRANSACTION ─────────────────────────────────────────────────────────────

class Transaction(models.Model):
    """Audit trail for all financial transactions."""

    TYPE_CHOICES = [
        ('savings_deposit', 'Savings Deposit'),
        ('savings_withdrawal', 'Savings Withdrawal'),
        ('loan_disbursement', 'Loan Disbursement'),
        ('loan_repayment', 'Loan Repayment'),
        ('contribution', 'Contribution'),
        ('penalty', 'Penalty Fee'),
        ('dividend', 'Dividend'),
        ('bank_deposit', 'Bank Deposit'),
        ('bank_withdrawal', 'Bank Withdrawal'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    transaction_id = models.CharField(max_length=25, unique=True, editable=False)
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=25, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255)
    reference_id = models.CharField(max_length=30, blank=True, help_text="Loan ID / Savings ID etc")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='success')
    paystack_reference = models.CharField(max_length=100, blank=True, unique=False, db_index=True)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='transactions')
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    date = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']

    def save(self, *args, **kwargs):
        if not self.transaction_id:
            count = Transaction.objects.count() + 1
            self.transaction_id = f"TXN-{timezone.now().strftime('%Y%m%d')}-{str(count).zfill(5)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.transaction_id} | {self.transaction_type} | ₦{self.amount:,.2f}"


# ─── NOTIFICATION ─────────────────────────────────────────────────────────────

class Notification(models.Model):
    """System notifications for members and admins."""

    TYPE_CHOICES = [
        ('loan_approved', 'Loan Approved'),
        ('loan_rejected', 'Loan Rejected'),
        ('loan_due', 'Loan Due Reminder'),
        ('repayment_confirmed', 'Repayment Confirmed'),
        ('savings_credited', 'Savings Credited'),
        ('contribution_due', 'Contribution Due'),
        ('general', 'General Announcement'),
        ('risk_alert', 'Risk Alert'),
    ]

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=25, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    action_url = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.recipient.username} | {self.title}"


# ─── SYSTEM SETTINGS ─────────────────────────────────────────────────────────

class CoopSettings(models.Model):
    """Global cooperative configuration."""

    coop_name = models.CharField(max_length=200, default='Chrisland University Cooperative')
    coop_reg_number = models.CharField(max_length=50, blank=True)
    coop_address = models.TextField(blank=True)
    coop_phone = models.CharField(max_length=15, blank=True)
    coop_email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to='coop/', null=True, blank=True)
    monthly_contribution_amount = models.DecimalField(max_digits=10, decimal_places=2, default=5000)
    max_loan_multiplier = models.FloatField(default=3.0,
                                            help_text="Maximum loan = savings × multiplier")
    default_interest_rate = models.DecimalField(max_digits=5, decimal_places=2, default=10.00)
    late_payment_penalty_rate = models.DecimalField(max_digits=5, decimal_places=2, default=2.00)
    min_savings_for_loan = models.DecimalField(max_digits=10, decimal_places=2, default=10000)
    min_months_for_loan = models.IntegerField(default=3)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cooperative Settings'
        verbose_name_plural = 'Cooperative Settings'

    def __str__(self):
        return self.coop_name

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
