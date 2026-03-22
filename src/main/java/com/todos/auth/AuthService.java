package com.todos.auth;

import com.todos.model.RefreshToken;
import com.todos.model.User;
import com.todos.repository.RefreshTokenRepository;
import com.todos.repository.UserRepository;
import com.todos.security.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepo;
    private final RefreshTokenRepository refreshTokenRepo;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;
    private final long refreshExpirationDays;

    public AuthService(UserRepository userRepo,
                       RefreshTokenRepository refreshTokenRepo,
                       JwtUtil jwtUtil,
                       PasswordEncoder passwordEncoder,
                       @Value("${app.jwt.refresh-expiration-days:30}") long refreshExpirationDays) {
        this.userRepo = userRepo;
        this.refreshTokenRepo = refreshTokenRepo;
        this.jwtUtil = jwtUtil;
        this.passwordEncoder = passwordEncoder;
        this.refreshExpirationDays = refreshExpirationDays;
    }

    @Transactional
    public AuthResult register(String email, String password) {
        if (userRepo.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        User user = new User(email, passwordEncoder.encode(password));
        userRepo.save(user);

        String accessToken = jwtUtil.generate(user.getId(), user.getEmail());
        String refreshToken = createRefreshToken(user);
        return new AuthResult(accessToken, refreshToken);
    }

    @Transactional
    public AuthResult login(String email, String password) {
        User user = userRepo.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        String accessToken = jwtUtil.generate(user.getId(), user.getEmail());
        String refreshToken = createRefreshToken(user);
        return new AuthResult(accessToken, refreshToken);
    }

    @Transactional
    public String refresh(String tokenValue) {
        RefreshToken record = refreshTokenRepo.findByToken(tokenValue)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (record.isExpired()) {
            refreshTokenRepo.delete(record);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }

        User user = record.getUser();
        return jwtUtil.generate(user.getId(), user.getEmail());
    }

    @Transactional
    public void logout(String tokenValue) {
        refreshTokenRepo.findByToken(tokenValue)
                .ifPresent(refreshTokenRepo::delete);
    }

    private String createRefreshToken(User user) {
        String tokenValue = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plus(refreshExpirationDays, ChronoUnit.DAYS);
        refreshTokenRepo.save(new RefreshToken(user, tokenValue, expiresAt));
        return tokenValue;
    }

    public record AuthResult(String accessToken, String refreshToken) {}
}
