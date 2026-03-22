package com.todos.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Serialises and broadcasts todo events to all WebSocket sessions belonging to a user.
 *
 * Event format (matches the frontend's expected schema):
 *   { "type": "todo:created",  "payload": { ...todo fields... } }
 *   { "type": "todo:updated",  "payload": { ...todo fields... } }
 *   { "type": "todo:deleted",  "payload": { "id": "<uuid>" } }
 */
@Component
public class TodoBroadcaster {

    private final TodoWebSocketHandler handler;
    private final ObjectMapper objectMapper;

    public TodoBroadcaster(TodoWebSocketHandler handler, ObjectMapper objectMapper) {
        this.handler = handler;
        this.objectMapper = objectMapper;
    }

    public void broadcast(UUID userId, String type, Object payload) {
        try {
            String json = objectMapper.writeValueAsString(Map.of("type", type, "payload", payload));
            handler.broadcastToUser(userId, json);
        } catch (Exception ignored) {
            // Don't let broadcast failures affect the HTTP response
        }
    }

    public void broadcastDelete(UUID userId, UUID todoId) {
        broadcast(userId, "todo:deleted", Map.of("id", todoId.toString()));
    }
}
