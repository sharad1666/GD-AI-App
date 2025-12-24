package com.gdai.backend.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

import com.gdai.backend.dto.TranscriptMessage;
import com.gdai.backend.service.TranscriptStore;

import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;


public class SignalingHandler extends TextWebSocketHandler {

    private static final ObjectMapper mapper = new ObjectMapper();

    // roomId -> sessions
    private static final Map<String, Set<WebSocketSession>> rooms =
            new ConcurrentHashMap<>();

    // sessionId -> userId
    private static final Map<String, String> sessionUsers =
            new ConcurrentHashMap<>();

    @Override
    protected void handleTextMessage(
            WebSocketSession session,
            TextMessage message
    ) throws Exception {

        // ✅ FIX: parse message FIRST
        JsonNode node = mapper.readTree(message.getPayload());
        String type = node.get("type").asText();

        /* =========================
           JOIN ROOM
        ========================= */
        if ("join".equals(type)) {
            String roomId = node.get("roomId").asText();
            String name = node.get("name").asText();

            rooms.putIfAbsent(roomId, ConcurrentHashMap.newKeySet());
            rooms.get(roomId).add(session);

            sessionUsers.put(session.getId(), name);

            // send existing users
            ArrayNode existing = mapper.createArrayNode();
            for (WebSocketSession s : rooms.get(roomId)) {
                if (!s.getId().equals(session.getId())) {
                    ObjectNode u = mapper.createObjectNode();
                    u.put("id", s.getId());
                    u.put("name", sessionUsers.get(s.getId()));
                    existing.add(u);
                }
            }

            ObjectNode response = mapper.createObjectNode();
            response.put("type", "existing-users");
            response.set("users", existing);

            session.sendMessage(new TextMessage(response.toString()));

            // notify others
            ObjectNode joined = mapper.createObjectNode();
            joined.put("type", "new-user");
            ObjectNode user = mapper.createObjectNode();
            user.put("id", session.getId());
            user.put("name", name);
            joined.set("user", user);

            broadcast(roomId, joined, session);
        }

        /* =========================
           OFFER / ANSWER / ICE
        ========================= */
        if ("offer".equals(type) ||
            "answer".equals(type) ||
            "ice".equals(type)) {

            String to = node.get("to").asText();
            WebSocketSession target = findSession(to);

            if (target != null && target.isOpen()) {
                ObjectNode forward = mapper.createObjectNode();
                forward.put("type", type);
                forward.put("from", session.getId());

                if (node.has("offer")) forward.set("offer", node.get("offer"));
                if (node.has("answer")) forward.set("answer", node.get("answer"));
                if (node.has("candidate"))
                    forward.set("candidate", node.get("candidate"));

                target.sendMessage(new TextMessage(forward.toString()));
            }
        }

        /* =========================
           SPEAKING INDICATOR
        ========================= */
        if ("speaking".equals(type)) {
            String roomId = node.get("roomId").asText();
            boolean speaking = node.get("isSpeaking").asBoolean();

            ObjectNode msg = mapper.createObjectNode();
            msg.put("type", "speaking");
            msg.put("userId", session.getId());
            msg.put("isSpeaking", speaking);

            broadcast(roomId, msg, session);
        }

        /* =========================
           TRANSCRIPT
        ========================= */
        if ("transcript".equals(type)) {
            TranscriptMessage transcript =
                    new TranscriptMessage(
                            node.get("roomId").asText(),
                            node.get("userName").asText(),
                            node.get("text").asText(),
                            System.currentTimeMillis()
                    );

            TranscriptStore.add(transcript);
        }

        /* =========================
           LEAVE
        ========================= */
        if ("leave".equals(type)) {
            removeSession(session);
        }
    }

    @Override
    public void afterConnectionClosed(
            WebSocketSession session,
            CloseStatus status
    ) {
        removeSession(session);
    }

    /* =========================
       HELPERS
    ========================= */
    private void broadcast(
            String roomId,
            ObjectNode message,
            WebSocketSession exclude
    ) throws Exception {

        for (WebSocketSession s : rooms.getOrDefault(roomId, Set.of())) {
            if (!s.getId().equals(exclude.getId()) && s.isOpen()) {
                s.sendMessage(new TextMessage(message.toString()));
            }
        }
    }

    private WebSocketSession findSession(String id) {
        for (Set<WebSocketSession> set : rooms.values()) {
            for (WebSocketSession s : set) {
                if (s.getId().equals(id)) return s;
            }
        }
        return null;
    }

    private void removeSession(WebSocketSession session) {
        for (Set<WebSocketSession> set : rooms.values()) {
            set.remove(session);
        }

        ObjectNode msg = mapper.createObjectNode();
        msg.put("type", "user-left");
        msg.put("userId", session.getId());

        rooms.forEach((roomId, set) -> {
            try {
                broadcast(roomId, msg, session);
            } catch (Exception ignored) {}
        });

        sessionUsers.remove(session.getId());
    }
}
