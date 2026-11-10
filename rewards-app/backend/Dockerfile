FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# สร้างทั้งตัวเซิร์ฟเวอร์และเครื่องมือฐานข้อมูล จะได้สั่ง migrate/seed ในคอนเทนเนอร์ได้
RUN CGO_ENABLED=0 go build -o /out/rewards . && \
    CGO_ENABLED=0 go build -o /out/rewards-migrate ./cmd/migrate && \
    CGO_ENABLED=0 go build -o /out/rewards-seed ./cmd/seed && \
    CGO_ENABLED=0 go build -o /out/rewards-check ./cmd/check

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache tzdata ca-certificates
ENV TZ=Asia/Bangkok
COPY --from=build /out/ /app/
COPY --from=build /app/db /app/db
EXPOSE 4007
CMD ["/app/rewards"]
