package com.gdai.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class SignalingHandler extends TextWebSocketHandler {

    private final ObjectMapper mapper = new ObjectMapper();

    // roomId -> sessions
    private static final Map<String, Set<WebSocketSession>> rooms =
            new ConcurrentHashMap<>();

    // sessionId -> roomId
    private static final Map<String, String> sessionRoom =
            new ConcurrentHashMap<>();

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = sessionRoom.remove(session.getId());
        if (roomId == null) return;

        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            room.remove(session);

            // notify others
            ObjectNode msg = mapper.createObjectNode();
            msg.put("type", "user-left");
            msg.put("userId", session.getId());

            for (WebSocketSession s : room) {
                s.sendMessage(new TextMessage(msg.toString()));
            }

            if (room.isEmpty()) {
                rooms.remove(roomId);
            }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode data = mapper.readTree(message.getPayload());
        String type = data.get("type").asText();

        switch (type) {
            case "join" -> handleJoin(session, data);
            case "offer", "answer", "ice" -> relay(session, data);
        }
    }

    private void handleJoin(WebSocketSession session, JsonNode data) throws Exception {
        String roomId = data.get("roomId").asText();

        rooms.putIfAbsent(roomId, ConcurrentHashMap.newKeySet());
        Set<WebSocketSession> room = rooms.get(roomId);

        // send existing users to new user
        ArrayNode users = mapper.createArrayNode();
        for (WebSocketSession s : room) {
            users.add(s.getId());
        }

        ObjectNode existing = mapper.createObjectNode();
        existing.put("type", "existing-users");
        existing.set("users", users);

        session.sendMessage(new TextMessage(existing.toString()));

        // add user
        room.add(session);
        sessionRoom.put(session.getId(), roomId);

        // notify others
        ObjectNode joined = mapper.createObjectNode();
        joined.put("type", "new-user");
        joined.put("userId", session.getId());

        for (WebSocketSession s : room) {
            if (!s.getId().equals(session.getId())) {
                s.sendMessage(new TextMessage(joined.toString()));
            }
        }
    }

    private void relay(WebSocketSession sender, JsonNode data) throws Exception {
        String to = data.get("to").asText();
        String roomId = sessionRoom.get(sender.getId());

        if (roomId == null) return;

        for (WebSocketSession s : rooms.get(roomId)) {
            if (s.getId().equals(to)) {
                ((ObjectNode) data).put("from", sender.getId());
                s.sendMessage(new TextMessage(data.toString()));
                break;
            }
        }
    }
}
