package com.todos;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void register_returns_201_with_access_token() throws Exception {
        mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "alice@example.com",
                                "password", "password123"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isString());
    }

    @Test
    void register_duplicate_email_returns_409() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "email", "bob@example.com", "password", "password123"));
        mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON).content(body));
        mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void login_with_valid_credentials_returns_200_with_token() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "email", "carol@example.com", "password", "password123"));
        mvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON).content(body));
        mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString());
    }

    @Test
    void login_with_wrong_password_returns_401() throws Exception {
        mvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                        "email", "dave@example.com", "password", "password123"))));
        mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "dave@example.com", "password", "wrongpass"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refresh_with_valid_cookie_returns_new_token() throws Exception {
        var result = mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "eve@example.com", "password", "password123"))))
                .andReturn();

        String setCookie = result.getResponse().getHeader("Set-Cookie");
        String refreshToken = extractCookieValue(setCookie, "refreshToken");

        mvc.perform(post("/auth/refresh")
                        .cookie(new jakarta.servlet.http.Cookie("refreshToken", refreshToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString());
    }

    @Test
    void logout_clears_cookie_and_returns_204() throws Exception {
        var result = mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "frank@example.com", "password", "password123"))))
                .andReturn();

        String setCookie = result.getResponse().getHeader("Set-Cookie");
        String refreshToken = extractCookieValue(setCookie, "refreshToken");

        mvc.perform(post("/auth/logout")
                        .cookie(new jakarta.servlet.http.Cookie("refreshToken", refreshToken)))
                .andExpect(status().isNoContent());
    }

    private String extractCookieValue(String setCookieHeader, String name) {
        if (setCookieHeader == null) return null;
        for (String part : setCookieHeader.split(";")) {
            part = part.trim();
            if (part.startsWith(name + "=")) {
                return part.substring(name.length() + 1);
            }
        }
        return null;
    }
}
