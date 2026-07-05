"""Global context processors for templates."""
from .models import Notification, CoopSettings, Member


def global_context(request):
    ctx = {}
    if request.user.is_authenticated:
        ctx['unread_notifications'] = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).count()
        ctx['coop_settings'] = CoopSettings.get_settings()
        try:
            ctx['member_profile'] = request.user.member_profile
        except Exception:
            ctx['member_profile'] = None
    return ctx
