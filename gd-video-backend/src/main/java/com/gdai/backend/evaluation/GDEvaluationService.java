package com.gdai.backend.evaluation;

public class GDEvaluationService {

    public GDReport evaluate(ParticipantStats s) {

        double participation = Math.min(10, s.speakingTurns);
        double confidence = Math.min(10, s.speakingTimeMs / 60000.0);
        double fluency = Math.max(0, 10 - s.fillerWordCount);
        double vocabulary = Math.min(10, s.wordCount / 20.0);

        double finalScore =
                (participation + confidence + fluency + vocabulary) / 4;

        return new GDReport(
                participation,
                confidence,
                fluency,
                vocabulary,
                finalScore
        );
    }
}
