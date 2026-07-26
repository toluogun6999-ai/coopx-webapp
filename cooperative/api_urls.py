"""
CoopSys REST API URL routes.
Mounted at /api/ by the project urls.py.
"""
from django.urls import path
from . import api_views as v

urlpatterns = [
    # ─── AUTH ────────────────────────────────────────────────────────────
    path("auth/login/",           v.api_login,            name="api_login"),
    path("auth/signup/",          v.api_signup,           name="api_signup"),
    path("auth/google/",          v.api_google_login,     name="api_google_login"),
    path("auth/logout/",          v.api_logout,           name="api_logout"),
    path("auth/me/",              v.api_me,               name="api_me"),
    path("auth/password-reset/",          v.api_password_reset,         name="api_password_reset"),
    path("auth/password-reset/confirm/",  v.api_password_reset_confirm, name="api_password_reset_confirm"),
    path("auth/update-password/", v.api_update_password,  name="api_update_password"),

    # ─── PROFILES / MEMBERS ──────────────────────────────────────────────
    path("profiles/",                        v.api_profiles,              name="api_profiles"),
    path("profiles/me/",                     v.api_update_my_profile,     name="api_update_my_profile"),
    path("profiles/<str:member_id>/",        v.api_profile_detail,        name="api_profile_detail"),
    path("profiles/<str:member_id>/status/", v.api_update_member_status,  name="api_member_status"),
    path("profiles/<str:member_id>/role/",   v.api_update_member_role,    name="api_member_role"),

    # ─── LOANS ───────────────────────────────────────────────────────────
    path("loans/",                            v.api_loans,          name="api_loans"),
    path("loans/apply/",                      v.api_loan_apply,     name="api_loan_apply"),
    path("loans/<str:loan_id>/decide/",       v.api_loan_decide,    name="api_loan_decide"),
    path("loans/<str:loan_id>/repayments/",   v.api_loan_repayment, name="api_loan_repayment"),

    # ─── SAVINGS ─────────────────────────────────────────────────────────
    path("savings/",     v.api_transactions,     name="api_transactions"),
    path("savings/add/", v.api_add_contribution, name="api_add_contribution"),

    # ─── BANK ACCOUNTS / REAL DEPOSITS & WITHDRAWALS (Paystack) ───────────
    path("exchange-rates/",             v.api_exchange_rates,        name="api_exchange_rates"),
    path("exchange-rates/<str:currency_code>/", v.api_exchange_rate_delete, name="api_exchange_rate_delete"),
    path("banks/",                  v.api_banks_list,          name="api_banks_list"),
    path("bank-accounts/",          v.api_bank_accounts,       name="api_bank_accounts"),
    path("deposits/initialize/",    v.api_deposit_initialize,  name="api_deposit_initialize"),
    path("withdrawals/",            v.api_withdrawal_initiate, name="api_withdrawal_initiate"),
    path("paystack/webhook/",       v.api_paystack_webhook,    name="api_paystack_webhook"),

    # ─── NOTIFICATIONS ───────────────────────────────────────────────────
    path("notifications/",      v.api_notifications,            name="api_notifications"),
    path("notifications/read/", v.api_mark_notifications_read,  name="api_notifications_read"),

    # ─── ANNOUNCEMENTS ───────────────────────────────────────────────────
    path("announcements/", v.api_announcements, name="api_announcements"),

    # ─── AUDIT ───────────────────────────────────────────────────────────
    path("audit/", v.api_audit_logs, name="api_audit"),

    # ─── SETTINGS ────────────────────────────────────────────────────────
    path("settings/", v.api_settings, name="api_settings"),

    # ─── ML / STATS ──────────────────────────────────────────────────────
    path("ml/metrics/",              v.api_ml_metrics,     name="api_ml_metrics"),
    path("ml/predict/<str:member_id>/", v.api_ml_predict,  name="api_ml_predict"),
    path("ml/retrain/",              v.api_ml_retrain,     name="api_ml_retrain"),
    path("stats/",                   v.api_dashboard_stats, name="api_stats"),

    # ─── EXPORTS (PDF / Excel) ───────────────────────────────────────────
    path("exports/savings-statement/", v.api_export_savings_statement, name="api_export_savings_statement"),
    path("exports/financial-report/",  v.api_export_financial_report,  name="api_export_financial_report"),
    path("exports/member-register/",   v.api_export_member_register,   name="api_export_member_register"),
    path("exports/savings-ledger/",    v.api_export_savings_ledger,    name="api_export_savings_ledger"),
    path("exports/loan-ledger/",       v.api_export_loan_ledger,       name="api_export_loan_ledger"),
]
