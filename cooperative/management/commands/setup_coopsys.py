"""
python manage.py setup_coopsys

Bootstraps the integrated CoopSys backend:
  - admin user            → admin@coopsys.ng / admin123
  - demo members          → <name>@coopsys.ng / member123
  - savings, loans, repayments, notifications
  - trains the Random Forest ML model

Emails match the demo credentials shown on the React login page.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from decimal import Decimal
from datetime import date, timedelta
import random


class Command(BaseCommand):
    help = "Set up CoopSys with demo data and train the ML model"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing data first")
        parser.add_argument("--skip-ml", action="store_true", help="Skip ML training")

    def handle(self, *args, **opts):
        self.stdout.write(self.style.SUCCESS("\n🚀  CoopSys integrated setup starting...\n"))
        if opts["reset"]:
            self._reset()
        self._settings()
        self._admin()
        self._members()
        self._loans()
        self._notifications()
        if not opts["skip_ml"]:
            self._train_ml()
        self._summary()

    def _reset(self):
        from cooperative.models import (Member, Savings, Loan, Repayment,
                                        Contribution, Transaction, Notification, MLPrediction)
        self.stdout.write(self.style.WARNING("⚠  Resetting data..."))
        for M in (MLPrediction, Notification, Transaction, Repayment, Loan,
                  Contribution, Savings, Member):
            M.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()

    def _settings(self):
        from cooperative.models import CoopSettings
        s, _ = CoopSettings.objects.get_or_create(pk=1)
        s.coop_name = "Chrisland University Staff Cooperative Society"
        s.coop_reg_number = "CRS/OG/2020/001"
        s.coop_address = "Chrisland University, Abeokuta, Ogun State"
        s.coop_phone = "+234 803 000 0001"
        s.coop_email = "coop@chrisland.edu.ng"
        s.monthly_contribution_amount = Decimal("5000.00")
        s.max_loan_multiplier = 3.0
        s.default_interest_rate = Decimal("10.00")
        s.late_payment_penalty_rate = Decimal("2.00")
        s.min_savings_for_loan = Decimal("10000.00")
        s.min_months_for_loan = 3
        s.save()
        self.stdout.write("  ✅ Settings configured.")

    def _admin(self):
        from cooperative.models import Member
        if User.objects.filter(username="admin").exists():
            self.stdout.write("  ℹ️  Admin exists.")
            return
        with transaction.atomic():
            u = User.objects.create_superuser(
                username="admin", email="admin@coopsys.ng", password="admin123",
                first_name="System", last_name="Administrator")
            Member.objects.create(user=u, phone="08000000000", gender="M",
                                  address="Chrisland University, Abeokuta",
                                  occupation="System Administrator",
                                  monthly_income=Decimal("200000"),
                                  is_admin=True, status="active")
        self.stdout.write("  ✅ Admin → admin@coopsys.ng / admin123")

    def _members(self):
        from cooperative.models import Member, Savings, Contribution
        PROFILES = [
            ("adebayo","Adebayo","Okafor","08012345678","M",85000,285000,24),
            ("chidinma","Chidinma","Eze","08023456789","F",120000,520000,36),
            ("musa","Musa","Ibrahim","08034567890","M",55000,95000,8),
            ("funke","Funke","Adeleke","08045678901","F",200000,780000,48),
            ("emeka","Emeka","Nwosu","08056789012","M",45000,142000,18),
            ("bola","Bola","Fashola","08067890123","M",100000,430000,30),
            ("ngozi","Ngozi","Obi","08078901234","F",75000,188000,14),
            ("tunde","Tunde","Bakare","08089012345","M",160000,960000,54),
            ("amaka","Amaka","Chukwu","08090123456","F",90000,340000,22),
            ("segun","Segun","Lawal","08001234567","M",68000,215000,16),
        ]
        made = 0
        for uname, fn, ln, ph, g, inc, sav, mo in PROFILES:
            if User.objects.filter(username=uname).exists():
                continue
            with transaction.atomic():
                join = date.today() - timedelta(days=mo*30)
                u = User.objects.create_user(username=uname, password="member123",
                        first_name=fn, last_name=ln, email=f"{uname}@coopsys.ng")
                m = Member.objects.create(user=u, phone=ph, gender=g,
                        address="Lagos, Nigeria", occupation="Staff",
                        monthly_income=Decimal(str(inc)),
                        total_savings=Decimal(str(sav)),
                        join_date=join, status="active")
                Savings.objects.create(member=m, amount=Decimal(str(sav)),
                        transaction_type="deposit", balance_after=Decimal(str(sav)),
                        description="Opening savings balance", date=join)
                for k in range(min(mo, 6)):
                    cd = date.today() - timedelta(days=k*30)
                    Contribution.objects.create(member=m, amount=Decimal("5000"),
                            frequency="monthly", period=cd.strftime("%B %Y"),
                            is_paid=True, date=cd)
                made += 1
                self.stdout.write(f"  ✅ {fn} {ln} ({m.member_id}) → {uname}@coopsys.ng / member123")
        self.stdout.write(f"\n  {made} members created.\n")

    def _loans(self):
        from cooperative.models import Member, Loan, Repayment, Transaction
        DATA = [
            ("adebayo",150000,"business","Business expansion",12,"active",60,"Low",0.12),
            ("musa",80000,"medical","Medical expenses",6,"overdue",0,"High",0.78),
            ("chidinma",200000,"education","School fees",12,"repaid",100,"Low",0.08),
            ("funke",300000,"housing","Home renovation",18,"active",35,"Medium",0.42),
            ("emeka",100000,"personal","Emergency",9,"overdue",20,"High",0.71),
        ]
        for uname, amt, pur, desc, ten, st, paidpct, risk, rp in DATA:
            try:
                m = Member.objects.get(user__username=uname)
            except Member.DoesNotExist:
                continue
            if Loan.objects.filter(member=m).exists():
                continue
            with transaction.atomic():
                ad = date.today() - timedelta(days=random.randint(30,180))
                amt_d = Decimal(str(amt))
                loan = Loan.objects.create(member=m, amount_requested=amt_d,
                    amount_approved=amt_d if st != "pending" else None,
                    interest_rate=Decimal("10.00"), tenure_months=ten,
                    purpose=pur, purpose_description=desc,
                    guarantor_name="Cooperative Society", status=st,
                    application_date=ad,
                    approval_date=ad+timedelta(days=3) if st!="pending" else None,
                    disbursement_date=ad+timedelta(days=5) if st in ["active","overdue","repaid"] else None,
                    due_date=ad+timedelta(days=ten*30) if st!="pending" else None,
                    risk_score=risk, risk_probability=rp)
                if paidpct > 0:
                    r = 0.10/12; n = ten
                    emi = float(amt_d)*r*(1+r)**n/((1+r)**n-1)
                    insts = max(1, int(paidpct/100*ten))
                    for i in range(1, insts+1):
                        pd = (loan.disbursement_date or ad)+timedelta(days=i*30)
                        Repayment.objects.create(loan=loan, amount=Decimal(str(round(emi,2))),
                            payment_date=pd, installment_number=i, status="confirmed",
                            is_late=(st=="overdue" and i==insts))
                        Transaction.objects.create(member=m, transaction_type="loan_repayment",
                            amount=Decimal(str(round(emi,2))),
                            description=f"Repayment #{i} for {loan.loan_id}", reference_id=loan.loan_id)
                if loan.amount_approved and st in ["active","overdue","repaid"]:
                    Transaction.objects.create(member=m, transaction_type="loan_disbursement",
                        amount=loan.amount_approved,
                        description=f"Disbursement — {loan.loan_id}", reference_id=loan.loan_id)
                self.stdout.write(f"  ✅ Loan {m.full_name} → ₦{amt:,} ({st})")

    def _notifications(self):
        from cooperative.models import Member, Notification, Loan
        for m in Member.objects.filter(is_admin=False)[:5]:
            Notification.objects.get_or_create(recipient=m.user, title="Welcome to CoopX!",
                defaults={"notification_type":"general",
                    "message":f"Dear {m.user.first_name}, your cooperative account is active."})
        admin = User.objects.filter(is_superuser=True).first()
        overdue = Loan.objects.filter(status="overdue").count()
        if admin and overdue:
            Notification.objects.get_or_create(recipient=admin,
                title=f"{overdue} Overdue Loan(s)",
                defaults={"notification_type":"risk_alert",
                    "message":f"{overdue} loan(s) are overdue and need attention."})
        self.stdout.write("  ✅ Notifications seeded.")

    def _train_ml(self):
        self.stdout.write("\n🤖  Training Random Forest model...")
        try:
            from cooperative.ml.predictor import train_model
            m = train_model(n_samples=1200)
            self.stdout.write(self.style.SUCCESS(
                f"  ✅ Trained — Accuracy {m['accuracy']}%, F1 {m['f1_score']}%"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ⚠  ML training failed: {e}"))

    def _summary(self):
        from cooperative.models import Member, Loan
        self.stdout.write("\n" + "="*56)
        self.stdout.write(self.style.SUCCESS("🎉  CoopSys backend ready!"))
        self.stdout.write(f"   Members: {Member.objects.count()}   Loans: {Loan.objects.count()}")
        self.stdout.write("")
        self.stdout.write("   Admin  → admin@coopsys.ng   / admin123")
        self.stdout.write("   Member → adebayo@coopsys.ng / member123")
        self.stdout.write("")
        self.stdout.write("   Django API : http://localhost:8000/api/")
        self.stdout.write("   React app  : http://localhost:5173/")
        self.stdout.write("="*56 + "\n")
