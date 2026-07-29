"""
python manage.py seed_demo_accounts [--count 15]

Creates N additional demo member accounts, each with 1-3 random savings
deposits, for populating dashboards/reports with more realistic-looking
data. Idempotent: uses a fixed "demoNN" username pattern and skips any
that already exist, so it's safe to run more than once (e.g. left in a
build command) without creating duplicates.
"""
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

FIRST_NAMES = [
    "Chinedu", "Aisha", "Ifeoma", "Bashir", "Grace", "Yusuf", "Blessing", "Kelechi",
    "Halima", "Obinna", "Chiamaka", "Suleiman", "Peace", "Uche", "Fatima", "Emmanuel",
    "Ngozi", "Abdullahi", "Tolu", "Rita",
]
LAST_NAMES = [
    "Okonkwo", "Bello", "Adeyemi", "Musa", "Eze", "Abubakar", "Nwachukwu", "Danjuma",
    "Okafor", "Suleiman", "Ogunleye", "Aliyu", "Umeh", "Garba", "Nnamdi", "Yakubu",
]
EMPLOYMENT_CHOICES = ["civil_servant", "private", "self_employed", "student", "retired", "other"]


class Command(BaseCommand):
    help = "Seed N additional demo member accounts with random savings deposits"

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=15)
        parser.add_argument("--password", default="member123")

    def handle(self, *args, **opts):
        from cooperative.models import Member, Savings

        count = opts["count"]
        password = opts["password"]
        created = 0

        for i in range(1, count + 1):
            username = f"demo{i:02d}"
            if User.objects.filter(username=username).exists():
                self.stdout.write(f"  - {username} already exists, skipping")
                continue

            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            phone = f"080{random.randint(10000000, 99999999)}"
            income = Decimal(random.randrange(40_000, 250_000, 5_000))

            with transaction.atomic():
                user = User.objects.create_user(
                    username=username, email=f"{username}@coopsys.ng", password=password,
                    first_name=first, last_name=last,
                )
                member = Member.objects.create(
                    user=user, phone=phone, gender=random.choice(["M", "F"]),
                    address=f"{random.randint(1, 200)} Independence Way, Lagos",
                    occupation=random.choice(["Teacher", "Trader", "Engineer", "Nurse", "Driver", "Clerk"]),
                    employment_type=random.choice(EMPLOYMENT_CHOICES),
                    monthly_income=income,
                    status="active",
                )

                # 1-3 random deposits per member, spread over the last ~6 months.
                balance = Decimal("0")
                for _ in range(random.randint(1, 3)):
                    amount = Decimal(random.randrange(10_000, 300_000, 5_000))
                    balance += amount
                    days_ago = random.randint(0, 180)
                    Savings.objects.create(
                        member=member, amount=amount, transaction_type="deposit",
                        balance_after=balance,
                        description="Demo seed deposit",
                        date=timezone.now().date() - timezone.timedelta(days=days_ago),
                    )
                member.total_savings = balance
                member.save(update_fields=["total_savings"])

            created += 1
            self.stdout.write(self.style.SUCCESS(
                f"  + {username} ({first} {last}) — balance ₦{balance:,.2f}"
            ))

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. Created {created} new demo account(s) (password: {password})."
        ))
