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

    private static final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message)
            throws Exception {

        JsonNode msg = mapper.readTree(message.getPayload());
        String type = msg.get("type").asText();
        if ("transcript".equals(type)) {
            TranscriptMessage transcript = new TranscriptMessage(
        node.get("roomId").asText(),
        node.get("userName").asText(),
        node.get("text").asText(),
        System.currentTimeMillis()
        );

        TranscriptStore.add(transcript);
        }

        if ("join".equals(type)) {
            handleJoin(session, msg);
        } else {
            forwardMessage(session, msg);
        }
    }

    private void handleJoin(WebSocketSession session, JsonNode msg) throws Exception {
        String roomId = msg.get("roomId").asText();
        rooms.putIfAbsent(roomId, ConcurrentHashMap.newKeySet());
        Set<WebSocketSession> users = rooms.get(roomId);

        // Send existing users to new user
        ArrayNode arr = mapper.createArrayNode();
        for (WebSocketSession s : users) {
            arr.add(s.getId());
        }

        ObjectNode response = mapper.createObjectNode();
        response.put("type", "existing-users");
        response.set("users", arr);

        session.sendMessage(new TextMessage(response.toString()));

        // Notify others
        for (WebSocketSession s : users) {
            ObjectNode notify = mapper.createObjectNode();
            notify.put("type", "new-user");
            notify.put("userId", session.getId());
            s.sendMessage(new TextMessage(notify.toString()));
        }

        users.add(session);
    }

    private void forwardMessage(WebSocketSession from, JsonNode msg) throws Exception {
        String to = msg.get("to").asText();

        for (Set<WebSocketSession> room : rooms.values()) {
            for (WebSocketSession s : room) {
                if (s.getId().equals(to)) {
                    ((ObjectNode) msg).put("from", from.getId());
                    s.sendMessage(new TextMessage(msg.toString()));
                    return;
                }
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        rooms.values().forEach(room -> room.remove(session));
    }
}
