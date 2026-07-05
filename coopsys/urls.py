from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    # REST API for the React (CoopX) frontend
    path('api/', include('cooperative.api_urls')),
    # legacy Django server-rendered UI (still available at /)
    path('', include('cooperative.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

admin.site.site_header = "CoopSys Administration"
admin.site.site_title = "CoopSys Admin"
admin.site.index_title = "Cooperative Society Management"
