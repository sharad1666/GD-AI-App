package com.gdai.backend.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.gdai.backend.evaluation.GDEvaluationService;
import com.gdai.backend.evaluation.GDReport;
import com.gdai.backend.evaluation.ParticipantStats;
import com.gdai.backend.report.GDReportPdfGenerator;

@RestController
@RequestMapping("/api/evaluation")
public class EvaluationController {

    private final GDEvaluationService service = new GDEvaluationService();

    @PostMapping("/report")
    public GDReport evaluate(@RequestBody ParticipantStats stats) {
        return service.evaluate(stats);
    }
    @PostMapping("/report/pdf")
    public ResponseEntity<byte[]> downloadPdf(@RequestBody ParticipantStats stats) {

        GDReport report = service.evaluate(stats);

        byte[] pdf = GDReportPdfGenerator.generatePdf(
                stats.userId,
                report
        );

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=GD_Report_" + stats.userId + ".pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

}
