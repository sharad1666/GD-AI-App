package com.gdai.backend.report;

import com.gdai.backend.evaluation.GDReport;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfWriter;

import java.io.ByteArrayOutputStream;

public class GDReportPdfGenerator {

    public static byte[] generatePdf(String userId, GDReport report) {

        Document document = new Document();
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont = new Font(Font.HELVETICA, 18, Font.BOLD);
            Font bodyFont = new Font(Font.HELVETICA, 12);

            document.add(new Paragraph("GD PERFORMANCE REPORT", titleFont));
            document.add(new Paragraph(" "));
            document.add(new Paragraph("Participant: " + userId, bodyFont));
            document.add(new Paragraph(" "));

            document.add(new Paragraph("Participation: " + report.participation));
            document.add(new Paragraph("Confidence: " + report.confidence));
            document.add(new Paragraph("Fluency: " + report.fluency));
            document.add(new Paragraph("Vocabulary: " + report.vocabulary));
            document.add(new Paragraph(" "));

            document.add(new Paragraph(
                    "FINAL SCORE: " + String.format("%.2f", report.finalScore),
                    new Font(Font.HELVETICA, 14, Font.BOLD)
            ));

            document.add(new Paragraph(" "));
            document.add(new Paragraph("AI Feedback:", bodyFont));
            document.add(new Paragraph("- Good clarity of thoughts"));
            document.add(new Paragraph("- Improve participation frequency"));
            document.add(new Paragraph("- Reduce filler words"));

            document.close();

        } catch (Exception e) {
            e.printStackTrace();
        }

        return out.toByteArray();
    }
}
