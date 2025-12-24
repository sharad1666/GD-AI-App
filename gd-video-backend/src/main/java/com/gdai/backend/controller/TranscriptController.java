package com.gdai.backend.controller;

import com.gdai.backend.service.TranscriptStore;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/transcript")
@CrossOrigin
public class TranscriptController {

    @GetMapping("/{roomId}")
    public Object getTranscript(@PathVariable String roomId) {
        return TranscriptStore.getRoomTranscript(roomId);
    }
}
