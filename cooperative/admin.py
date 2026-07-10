"""
CoopSys Django Admin Registration
"""
from django.contrib import admin
from .models import (
    Member, Savings, Contribution, Loan, Repayment,
    MLPrediction, Transaction, Notification, CoopSettings, BankAccount, ExchangeRate
)


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display  = ['member_id', 'full_name', 'phone', 'total_savings', 'status', 'join_date']
    list_filter   = ['status', 'gender', 'employment_type']
    search_fields = ['member_id', 'user__first_name', 'user__last_name', 'user__email', 'phone']
    ordering      = ['-join_date']
    readonly_fields = ['member_id', 'created_at', 'updated_at']


@admin.register(Savings)
class SavingsAdmin(admin.ModelAdmin):
    list_display  = ['transaction_id', 'member', 'transaction_type', 'amount', 'balance_after', 'date']
    list_filter   = ['transaction_type']
    search_fields = ['transaction_id', 'member__member_id', 'member__user__first_name']
    ordering      = ['-date']


@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display  = ['contribution_id', 'member', 'amount', 'period', 'frequency', 'is_paid', 'date']
    list_filter   = ['frequency', 'is_paid']
    search_fields = ['member__user__first_name', 'period']


@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):
    list_display  = ['loan_id', 'member', 'amount_requested', 'status', 'risk_score', 'application_date']
    list_filter   = ['status', 'risk_score', 'purpose']
    search_fields = ['loan_id', 'member__user__first_name', 'member__member_id']
    ordering      = ['-application_date']
    readonly_fields = ['loan_id', 'created_at', 'updated_at']


@admin.register(Repayment)
class RepaymentAdmin(admin.ModelAdmin):
    list_display  = ['repayment_id', 'loan', 'amount', 'payment_date', 'status', 'is_late']
    list_filter   = ['status', 'is_late']
    search_fields = ['repayment_id', 'loan__loan_id']


@admin.register(MLPrediction)
class MLPredictionAdmin(admin.ModelAdmin):
    list_display  = ['member', 'risk_level', 'default_probability', 'algorithm_used', 'prediction_date']
    list_filter   = ['risk_level', 'algorithm_used']
    search_fields = ['member__user__first_name', 'member__member_id']
    readonly_fields = ['prediction_id', 'prediction_date']


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display  = ['transaction_id', 'member', 'transaction_type', 'amount', 'status', 'date']
    list_filter   = ['transaction_type', 'status']
    search_fields = ['transaction_id', 'member__user__first_name', 'paystack_reference']
    ordering      = ['-date']


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ['currency_code', 'currency_name', 'rate_to_ngn', 'updated_at']
    search_fields = ['currency_code', 'currency_name']


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display  = ['account_name', 'bank_name', 'account_number', 'member', 'is_verified', 'is_default']
    list_filter   = ['is_verified', 'is_default', 'bank_name']
    search_fields = ['account_name', 'account_number', 'member__member_id']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ['recipient', 'title', 'notification_type', 'is_read', 'created_at']
    list_filter   = ['notification_type', 'is_read']
    search_fields = ['recipient__username', 'title']


@admin.register(CoopSettings)
class CoopSettingsAdmin(admin.ModelAdmin):
    list_display = ['coop_name', 'default_interest_rate', 'monthly_contribution_amount', 'updated_at']
