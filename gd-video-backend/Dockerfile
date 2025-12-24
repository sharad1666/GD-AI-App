# Use lightweight Java 17 image
FROM eclipse-temurin:17-jre

# Set working directory
WORKDIR /app

# Copy jar into container
COPY target/*.jar app.jar

# Expose port (Render uses dynamic PORT)
EXPOSE 8080

# Start Spring Boot
CMD ["java", "-jar", "app.jar"]
