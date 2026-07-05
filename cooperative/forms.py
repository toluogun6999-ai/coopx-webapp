"""
CoopSys Forms
=============
All form definitions for authentication, member management, savings, loans, and settings.
"""
from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .models import Member, Savings, Loan, Repayment, Contribution, CoopSettings


# ─── AUTHENTICATION FORMS ────────────────────────────────────────────────────

class RegisterForm(UserCreationForm):
    first_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'First Name'}))
    last_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Last Name'}))
    email = forms.EmailField(widget=forms.EmailInput(attrs={'class': 'form-control', 'placeholder': 'Email Address'}))
    phone = forms.CharField(max_length=15, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Phone Number'}))
    gender = forms.ChoiceField(choices=Member.GENDER_CHOICES, widget=forms.Select(attrs={'class': 'form-control'}))
    address = forms.CharField(widget=forms.Textarea(attrs={'class': 'form-control', 'rows': 2, 'placeholder': 'Residential Address'}))
    occupation = forms.CharField(max_length=100, required=False, widget=forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Occupation'}))
    monthly_income = forms.DecimalField(min_value=0, widget=forms.NumberInput(attrs={'class': 'form-control', 'placeholder': 'Monthly Income (₦)'}))

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ['username', 'first_name', 'last_name', 'email',
                  'phone', 'gender', 'address', 'occupation', 'monthly_income',
                  'password1', 'password2']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field_name, field in self.fields.items():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'
        self.fields['username'].widget.attrs['placeholder'] = 'Username'
        self.fields['password1'].widget.attrs['placeholder'] = 'Password'
        self.fields['password2'].widget.attrs['placeholder'] = 'Confirm Password'


class LoginForm(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['username'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Username'})
        self.fields['password'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Password'})


# ─── MEMBER FORMS ─────────────────────────────────────────────────────────────

class MemberProfileForm(forms.ModelForm):
    class Meta:
        model = Member
        fields = ['phone', 'gender', 'date_of_birth', 'address', 'occupation',
                  'employment_type', 'monthly_income', 'next_of_kin',
                  'next_of_kin_phone', 'profile_photo']
        widgets = {
            'date_of_birth': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'address': forms.Textarea(attrs={'rows': 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'


class AdminAddMemberForm(forms.Form):
    """Admin form to manually add a member."""
    first_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control'}))
    last_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control'}))
    username = forms.CharField(max_length=150, widget=forms.TextInput(attrs={'class': 'form-control'}))
    email = forms.EmailField(widget=forms.EmailInput(attrs={'class': 'form-control'}))
    phone = forms.CharField(max_length=15, widget=forms.TextInput(attrs={'class': 'form-control'}))
    gender = forms.ChoiceField(choices=Member.GENDER_CHOICES, widget=forms.Select(attrs={'class': 'form-control'}))
    address = forms.CharField(widget=forms.Textarea(attrs={'class': 'form-control', 'rows': 2}))
    monthly_income = forms.DecimalField(min_value=0, widget=forms.NumberInput(attrs={'class': 'form-control'}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'class': 'form-control'}), initial='CoopSys@2025')


# ─── SAVINGS FORMS ────────────────────────────────────────────────────────────

class SavingsForm(forms.ModelForm):
    class Meta:
        model = Savings
        fields = ['member', 'amount', 'transaction_type', 'description', 'date']
        widgets = {
            'date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'description': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'Optional description'}),
            'amount': forms.NumberInput(attrs={'class': 'form-control', 'min': '0', 'step': '0.01'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'


class ContributionForm(forms.ModelForm):
    class Meta:
        model = Contribution
        fields = ['member', 'amount', 'frequency', 'period', 'description', 'date']
        widgets = {
            'date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'period': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g. May 2025'}),
            'amount': forms.NumberInput(attrs={'class': 'form-control', 'min': '0'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'


# ─── LOAN FORMS ──────────────────────────────────────────────────────────────

class LoanApplicationForm(forms.ModelForm):
    class Meta:
        model = Loan
        fields = ['amount_requested', 'tenure_months', 'purpose', 'purpose_description',
                  'guarantor_name', 'guarantor_phone', 'guarantor_member_id']
        widgets = {
            'purpose_description': forms.Textarea(attrs={'rows': 3, 'class': 'form-control',
                                                         'placeholder': 'Describe how you intend to use this loan...'}),
            'amount_requested': forms.NumberInput(attrs={'class': 'form-control', 'min': '1000', 'step': '1000'}),
            'tenure_months': forms.NumberInput(attrs={'class': 'form-control', 'min': '1', 'max': '60'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'


class LoanApprovalForm(forms.ModelForm):
    class Meta:
        model = Loan
        fields = ['amount_approved', 'interest_rate', 'tenure_months', 'status',
                  'disbursement_date', 'due_date', 'rejection_reason']
        widgets = {
            'disbursement_date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'due_date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'rejection_reason': forms.Textarea(attrs={'rows': 2, 'class': 'form-control'}),
            'amount_approved': forms.NumberInput(attrs={'class': 'form-control', 'min': '0'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'


class RepaymentForm(forms.ModelForm):
    class Meta:
        model = Repayment
        fields = ['amount', 'payment_date', 'payment_method', 'notes']
        widgets = {
            'payment_date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'notes': forms.Textarea(attrs={'rows': 2, 'class': 'form-control'}),
            'amount': forms.NumberInput(attrs={'class': 'form-control', 'min': '0', 'step': '0.01'}),
            'payment_method': forms.Select(attrs={'class': 'form-control'},
                                           choices=[('Cash', 'Cash'), ('Transfer', 'Bank Transfer'),
                                                    ('POS', 'POS'), ('Cheque', 'Cheque')]),
        }


# ─── SETTINGS FORM ───────────────────────────────────────────────────────────

class CoopSettingsForm(forms.ModelForm):
    class Meta:
        model = CoopSettings
        fields = ['coop_name', 'coop_reg_number', 'coop_address', 'coop_phone',
                  'coop_email', 'logo', 'monthly_contribution_amount',
                  'max_loan_multiplier', 'default_interest_rate',
                  'late_payment_penalty_rate', 'min_savings_for_loan', 'min_months_for_loan']
        widgets = {
            'coop_address': forms.Textarea(attrs={'rows': 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-control'
