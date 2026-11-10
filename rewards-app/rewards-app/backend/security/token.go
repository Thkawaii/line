package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

// JWT แบบ HS256 เขียนด้วยไลบรารีที่มากับ Go
// โครงสร้างเป็นมาตรฐานเดียวกับ jsonwebtoken ฝั่ง Node จึงใช้แทนกันได้

type Claims struct {
	ID   int64  `json:"id"`
	Role string `json:"role"`
	Exp  int64  `json:"exp"`
}

var (
	ErrInvalidToken = errors.New("โทเค็นไม่ถูกต้อง")
	ErrExpiredToken = errors.New("โทเค็นหมดอายุแล้ว")
)

func secret() ([]byte, error) {
	value := os.Getenv("JWT_SECRET")
	if value == "" {
		return nil, errEmptySecret
	}
	return []byte(value), nil
}

func SignToken(id int64, role string, ttl time.Duration) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}

	header := base64url([]byte(`{"alg":"HS256","typ":"JWT"}`))

	claims := Claims{ID: id, Role: role, Exp: time.Now().Add(ttl).Unix()}
	body, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64url(body)

	signing := header + "." + payload
	return signing + "." + base64url(sign(key, signing)), nil
}

func ParseToken(token string) (*Claims, error) {
	key, err := secret()
	if err != nil {
		return nil, err
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	expected := sign(key, parts[0]+"."+parts[1])
	actual, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || subtle.ConstantTimeCompare(expected, actual) != 1 {
		return nil, ErrInvalidToken
	}

	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrInvalidToken
	}

	var claims Claims
	if err := json.Unmarshal(body, &claims); err != nil {
		return nil, ErrInvalidToken
	}
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, ErrExpiredToken
	}

	return &claims, nil
}

func sign(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func base64url(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}
