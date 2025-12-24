# ================================
# 1️⃣ Build stage (Maven)
# ================================
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

# Copy pom.xml first (for dependency caching)
COPY pom.xml .

RUN mvn dependency:go-offline

# Copy source code
COPY src ./src

# Build the jar
RUN mvn clean package -DskipTests


# ================================
# 2️⃣ Runtime stage (Lightweight JRE)
# ================================
FROM eclipse-temurin:17-jre

WORKDIR /app

# Copy jar from build stage
COPY --from=build /app/target/*.jar app.jar

# Expose port (Render injects PORT)
EXPOSE 8080

# Run Spring Boot
CMD ["java", "-jar", "app.jar"]
