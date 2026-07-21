package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// SolvePoW is retained for backward compatibility with the challenge API
func SolvePoW(challenge string, difficulty int) (nonce string, solution string, err error) {
	target := ""
	for i := 0; i < difficulty; i++ {
		target += "0"
	}
	for i := 0; ; i++ {
		nonce := fmt.Sprintf("%d", i)
		data := challenge + nonce
		hash := sha256.Sum256([]byte(data))
		hexHash := hex.EncodeToString(hash[:])
		if len(hexHash) >= difficulty && hexHash[:difficulty] == target {
			return nonce, hexHash, nil
		}
		if i > 10000000 {
			return "", "", fmt.Errorf("PoW computation exceeded limit")
		}
	}
}