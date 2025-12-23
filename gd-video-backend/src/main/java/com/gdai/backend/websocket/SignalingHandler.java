package com.gdai.backend.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class SignalingHandler extends TextWebSocketHandler {

    private static final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private static final Map<String, String> sessionRoomMap = new ConcurrentHashMap<>();
    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.put(session.getId(), session);
        System.out.println("Connected: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> payload =
                mapper.readValue(message.getPayload(), Map.class);

        String type = (String) payload.get("type");

        if ("join".equals(type)) {
            sessionRoomMap.put(session.getId(), (String) payload.get("roomId"));
            return;
        }

        String roomId = sessionRoomMap.get(session.getId());
        if (roomId == null) return;

        for (String id : sessions.keySet()) {
            if (!id.equals(session.getId())
                    && roomId.equals(sessionRoomMap.get(id))) {
                sessions.get(id).sendMessage(message);
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session.getId());
        sessionRoomMap.remove(session.getId());
        System.out.println("Disconnected: " + session.getId());
    }
}
