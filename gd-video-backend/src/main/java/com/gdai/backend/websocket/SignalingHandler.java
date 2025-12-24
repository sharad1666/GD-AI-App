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

    private static final ObjectMapper mapper = new ObjectMapper();

    private static final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private static final Map<String, String> sessionRoom = new ConcurrentHashMap<>();
    private static final Map<String, String> sessionName = new ConcurrentHashMap<>();

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode data = mapper.readTree(message.getPayload());
        String type = data.get("type").asText();

        switch (type) {
            case "join" -> joinRoom(session, data);
            case "offer", "answer", "ice" -> relay(session, data);
        }
    }

    private void joinRoom(WebSocketSession session, JsonNode data) throws Exception {
        String roomId = data.get("roomId").asText();
        String name = data.get("name").asText();

        rooms.putIfAbsent(roomId, ConcurrentHashMap.newKeySet());
        Set<WebSocketSession> room = rooms.get(roomId);

        ArrayNode users = mapper.createArrayNode();
        for (WebSocketSession s : room) {
            ObjectNode u = mapper.createObjectNode();
            u.put("id", s.getId());
            u.put("name", sessionName.get(s.getId()));
            users.add(u);
        }

        ObjectNode existing = mapper.createObjectNode();
        existing.put("type", "existing-users");
        existing.set("users", users);
        session.sendMessage(new TextMessage(existing.toString()));

        room.add(session);
        sessionRoom.put(session.getId(), roomId);
        sessionName.put(session.getId(), name);

        ObjectNode joined = mapper.createObjectNode();
        joined.put("type", "new-user");
        joined.put("id", session.getId());
        joined.put("name", name);

        for (WebSocketSession s : room) {
            if (!s.getId().equals(session.getId())) {
                s.sendMessage(new TextMessage(joined.toString()));
            }
        }
    }

    private void relay(WebSocketSession sender, JsonNode data) throws Exception {
        String roomId = sessionRoom.get(sender.getId());
        if (roomId == null) return;

        String to = data.get("to").asText();
        for (WebSocketSession s : rooms.get(roomId)) {
            if (s.getId().equals(to)) {
                ((ObjectNode) data).put("from", sender.getId());
                s.sendMessage(new TextMessage(data.toString()));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = sessionRoom.remove(session.getId());
        String name = sessionName.remove(session.getId());

        if (roomId == null) return;

        Set<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            room.remove(session);

            ObjectNode left = mapper.createObjectNode();
            left.put("type", "user-left");
            left.put("id", session.getId());

            for (WebSocketSession s : room) {
                s.sendMessage(new TextMessage(left.toString()));
            }

            if (room.isEmpty()) rooms.remove(roomId);
        }
    }
}
