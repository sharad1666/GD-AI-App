package com.gdai.backend.evaluation;

public class GDReport {
    public double participation;
    public double confidence;
    public double fluency;
    public double vocabulary;
    public double finalScore;

    public GDReport(double p, double c, double f, double v, double s) {
        participation = p;
        confidence = c;
        fluency = f;
        vocabulary = v;
        finalScore = s;
    }
}
