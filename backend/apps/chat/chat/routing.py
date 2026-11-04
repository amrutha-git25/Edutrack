
from django.urls import path

from .consumers import CallSignalingConsumer

websocket_urlpatterns = [
    path("ws/calls/", CallSignalingConsumer.as_asgi()),
]
