
import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError

from django.contrib.auth import get_user_model

from .models import CallSession

User = get_user_model()


class CallSignalingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = parse_qs(
            self.scope.get("query_string", b"").decode()
        )
        token = query.get("token", [None])[0]

        self.user = await self.authenticate_token(token)

        if not self.user:
            await self.close(code=4401)
            return

        self.user_group = f"call_user_{self.user.pk}"
        self.joined_call_groups = set()

        await self.channel_layer.group_add(
            self.user_group,
            self.channel_name,
        )

        await self.accept()

    async def disconnect(self, close_code):
        if getattr(self, "user_group", None):
            await self.channel_layer.group_discard(
                self.user_group,
                self.channel_name,
            )

        for group_name in getattr(
            self, "joined_call_groups", set()
        ):
            await self.channel_layer.group_discard(
                group_name,
                self.channel_name,
            )

    @database_sync_to_async
    def authenticate_token(self, token):
        if not token:
            return None

        try:
            access_token = AccessToken(token)
            user_id = access_token["user_id"]
            user = User.objects.get(pk=user_id, is_active=True)
            return user
        except (
            TokenError,
            User.DoesNotExist,
            KeyError,
            TypeError,
            ValueError,
        ):
            return None

    @database_sync_to_async
    def can_access_call(self, call_id):
        try:
            call = CallSession.objects.select_related(
                "conversation"
            ).get(pk=call_id)

            return (
                call
                if self.user.pk in {
                    call.caller_id,
                    call.callee_id,
                }
                else None
            )
        except (CallSession.DoesNotExist, ValueError, TypeError):
            return None

    async def receive_json(self, content, **kwargs):
        event_type = content.get("type")

        if event_type == "join_call":
            await self.join_call(content)
        elif event_type == "webrtc_signal":
            await self.relay_signal(content)
        elif event_type == "call_status":
            await self.relay_call_status(content)
        else:
            await self.send_json({
                "type": "error",
                "message": "Unknown signaling event.",
            })

    async def join_call(self, content):
        call_id = content.get("call_id")
        call = await self.can_access_call(call_id)

        if not call:
            await self.send_json({
                "type": "error",
                "message": "You cannot join this call.",
            })
            return

        group_name = f"call_room_{call.pk}"

        if group_name in self.joined_call_groups:
            return

        self.joined_call_groups.add(group_name)

        await self.channel_layer.group_add(
            group_name,
            self.channel_name,
        )

        await self.channel_layer.group_send(
            group_name,
            {
                "type": "peer_joined",
                "sender_id": self.user.pk,
                "call_id": str(call.pk),
            },
        )

        await self.send_json({
            "type": "joined_call",
            "call_id": str(call.pk),
        })

    async def relay_signal(self, content):
        call_id = content.get("call_id")
        group_name = f"call_room_{call_id}"

        if group_name not in self.joined_call_groups:
            await self.send_json({
                "type": "error",
                "message": "Join the call before sending signals.",
            })
            return

        signal = content.get("signal")

        if not isinstance(signal, dict):
            await self.send_json({
                "type": "error",
                "message": "Invalid WebRTC signal.",
            })
            return

        # Limit individual signaling payloads.
        if len(json.dumps(signal)) > 100_000:
            await self.send_json({
                "type": "error",
                "message": "Signaling payload is too large.",
            })
            return

        await self.channel_layer.group_send(
            group_name,
            {
                "type": "webrtc_signal",
                "sender_id": self.user.pk,
                "call_id": str(call_id),
                "signal": signal,
            },
        )

    async def relay_call_status(self, content):
        call_id = content.get("call_id")
        call = await self.can_access_call(call_id)

        if not call:
            await self.send_json({
                "type": "error",
                "message": "You cannot update this call.",
            })
            return

        action = content.get("action")

        if action not in {"accepted", "rejected", "ended"}:
            await self.send_json({
                "type": "error",
                "message": "Invalid call status event.",
            })
            return

        event = {
            "type": "call_status_event",
            "call_id": str(call.pk),
            "action": action,
            "sender_id": self.user.pk,
        }

        await self.channel_layer.group_send(
            f"call_user_{call.caller_id}",
            event,
        )
        await self.channel_layer.group_send(
            f"call_user_{call.callee_id}",
            event,
        )

    async def peer_joined(self, event):
        if event["sender_id"] == self.user.pk:
            return

        await self.send_json({
            "type": "peer_joined",
            "call_id": event["call_id"],
        })

    async def webrtc_signal(self, event):
        if event["sender_id"] == self.user.pk:
            return

        await self.send_json({
            "type": "webrtc_signal",
            "call_id": event["call_id"],
            "signal": event["signal"],
        })

    async def call_status_event(self, event):
        if event["sender_id"] == self.user.pk:
            return

        await self.send_json({
            "type": "call_status",
            "call_id": event["call_id"],
            "action": event["action"],
        })

    async def incoming_call(self, event):
        await self.send_json({
            "type": "incoming_call",
            "call": event["call"],
        })
