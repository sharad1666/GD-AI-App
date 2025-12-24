package com.gdai.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class SignalingHandler extends TextWebSocketHandler {

    private static final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message)
            throws Exception {

        JsonNode msg = mapper.readTree(message.getPayload());
        String type = msg.get("type").asText();

        switch (type) {
            case "join" -> handleJoin(session, msg);
            case "offer", "answer", "ice" -> forwardMessage(session, msg);
        }
    }

    private void handleJoin(WebSocketSession session, JsonNode msg) throws Exception {
        String roomId = msg.get("roomId").asText();
        rooms.putIfAbsent(roomId, ConcurrentHashMap.newKeySet());
        Set<WebSocketSession> users = rooms.get(roomId);

        // Send existing users to new user
        List<String> existing = new ArrayList<>();
        for (WebSocketSession s : users) {
            existing.add(s.getId());
        }

        session.sendMessage(new TextMessage(
                mapper.writeValueAsString(Map.of(
                        "type", "existing-users",
                        "users", existing
                ))
        ));

        // Notify others
        for (WebSocketSession s : users) {
            s.sendMessage(new TextMessage(
                    mapper.writeValueAsString(Map.of(
                            "type", "new-user",
                            "userId", session.getId()
                    ))
            ));
        }

        users.add(session);
    }

    private void forwardMessage(WebSocketSession from, JsonNode msg) throws Exception {
        String to = msg.get("to").asText();
        for (Set<WebSocketSession> room : rooms.values()) {
            for (WebSocketSession s : room) {
                if (s.getId().equals(to)) {
                    ((ObjectNode) msg).put("from", from.getId());
                    s.sendMessage(new TextMessage(mapper.writeValueAsString(msg)));
                    return;
                }
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status)
            throws Exception {
        rooms.values().forEach(room -> room.remove(session));
    }
}
