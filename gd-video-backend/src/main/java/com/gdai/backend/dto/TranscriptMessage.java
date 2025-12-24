package com.gdai.backend.dto;

public class TranscriptMessage {

    private String roomId;
    private String userName;
    private String text;
    private long timestamp;

    public TranscriptMessage() {}

    public TranscriptMessage(String roomId, String userName, String text, long timestamp) {
        this.roomId = roomId;
        this.userName = userName;
        this.text = text;
        this.timestamp = timestamp;
    }

    public String getRoomId() {
        return roomId;
    }

    public String getUserName() {
        return userName;
    }

    public String getText() {
        return text;
    }

    public long getTimestamp() {
        return timestamp;
    }
}
