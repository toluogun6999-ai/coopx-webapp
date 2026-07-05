from django.apps import AppConfig


class CooperativeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cooperative'
    verbose_name = 'Cooperative Society Management'

    def ready(self):
        """Auto-train ML model on first startup if not trained."""
        pass
