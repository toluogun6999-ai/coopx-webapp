"""CoopSys URL Configuration"""
from django.urls import path
from . import views

urlpatterns = [
    # ─── PUBLIC ──────────────────────────────────────────────────────────
    path('', views.home, name='home'),
    path('about/', views.about, name='about'),
    path('contact/', views.contact, name='contact'),

    # ─── AUTHENTICATION ──────────────────────────────────────────────────
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.user_login, name='login'),
    path('auth/logout/', views.user_logout, name='logout'),

    # ─── DASHBOARD ROUTER ────────────────────────────────────────────────
    path('dashboard/', views.dashboard, name='dashboard'),

    # ─── ADMIN PANEL ─────────────────────────────────────────────────────
    path('admin-panel/', views.admin_dashboard, name='admin_dashboard'),
    path('admin-panel/members/', views.admin_members, name='admin_members'),
    path('admin-panel/members/<str:member_id>/', views.admin_member_detail, name='admin_member_detail'),
    path('admin-panel/savings/', views.admin_savings, name='admin_savings'),
    path('admin-panel/loans/', views.admin_loans, name='admin_loans'),
    path('admin-panel/loans/<str:loan_id>/', views.admin_loan_detail, name='admin_loan_detail'),
    path('admin-panel/analytics/', views.admin_analytics, name='admin_analytics'),
    path('admin-panel/reports/', views.admin_reports, name='admin_reports'),
    path('admin-panel/settings/', views.admin_settings, name='admin_settings'),
    path('admin-panel/predict/<str:member_id>/', views.admin_run_prediction, name='admin_run_prediction'),

    # ─── MEMBER PORTAL ───────────────────────────────────────────────────
    path('member/', views.member_dashboard, name='member_dashboard'),
    path('member/profile/', views.member_profile, name='member_profile'),
    path('member/savings/', views.member_savings, name='member_savings'),
    path('member/loans/', views.member_loans, name='member_loans'),
    path('member/notifications/', views.member_notifications, name='member_notifications'),
    path('member/transactions/', views.member_transactions, name='member_transactions'),
]
