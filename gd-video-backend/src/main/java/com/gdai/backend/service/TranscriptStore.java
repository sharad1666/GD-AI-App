package com.gdai.backend.service;

import com.gdai.backend.dto.TranscriptMessage;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class TranscriptStore {

    // roomId -> list of transcript entries
    private static final Map<String, List<TranscriptMessage>> STORE =
            new ConcurrentHashMap<>();

    public static void add(TranscriptMessage msg) {
        STORE.computeIfAbsent(msg.getRoomId(), k -> new ArrayList<>())
             .add(msg);
    }

    public static List<TranscriptMessage> getRoomTranscript(String roomId) {
        return STORE.getOrDefault(roomId, Collections.emptyList());
    }

    public static void clearRoom(String roomId) {
        STORE.remove(roomId);
    }
}
