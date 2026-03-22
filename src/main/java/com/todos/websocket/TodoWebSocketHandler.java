package com.todos.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.List;

/**
 * Handles raw WebSocket connections.
 * On connect, registers the session by userId.
 * On disconnect, removes it.
 * Exposes broadcastToUser() for the rest of the app to send events.
 */
@Component
public class TodoWebSocketHandler extends TextWebSocketHandler {

    // userId → list of open sessions for that user
    private final Map<UUID, List<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID userId = extractUserId(session);
        if (userId == null) {
            closeQuietly(session);
            return;
        }
        sessions.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID userId = extractUserId(session);
        if (userId == null) return;
        List<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions != null) {
            userSessions.remove(session);
            if (userSessions.isEmpty()) {
                sessions.remove(userId);
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Server-push only — ignore any messages sent by the client
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        closeQuietly(session);
    }

    public void broadcastToUser(UUID userId, String jsonMessage) {
        List<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null || userSessions.isEmpty()) return;

        TextMessage msg = new TextMessage(jsonMessage);
        for (WebSocketSession session : userSessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(msg);
                } catch (IOException e) {
                    // Session may have closed between the isOpen check and sendMessage
                    closeQuietly(session);
                }
            }
        }
    }

    private UUID extractUserId(WebSocketSession session) {
        Object userId = session.getAttributes().get("userId");
        return (userId instanceof UUID u) ? u : null;
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close();
        } catch (IOException ignored) {}
    }
}
