package com.todos;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TodosIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    private String accessToken;

    @BeforeEach
    void setup() throws Exception {
        var result = mvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "test@example.com",
                                "password", "password123"))))
                .andReturn();
        var body = objectMapper.readTree(result.getResponse().getContentAsString());
        accessToken = body.get("token").asText();
    }

    @Test
    void list_todos_returns_empty_for_new_user() throws Exception {
        mvc.perform(get("/todos")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void create_todo_returns_201_with_todo() throws Exception {
        mvc.perform(post("/todos")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Buy milk"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.title").value("Buy milk"))
                .andExpect(jsonPath("$.completed").value(false));
    }

    @Test
    void created_todo_appears_in_list() throws Exception {
        mvc.perform(post("/todos")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("title", "Walk dog"))));

        mvc.perform(get("/todos")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Walk dog"));
    }

    @Test
    void update_todo_title_and_completed() throws Exception {
        var createResult = mvc.perform(post("/todos")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Original"))))
                .andReturn();
        String id = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        mvc.perform(patch("/todos/" + id)
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("completed", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.title").value("Original"));
    }

    @Test
    void delete_todo_removes_it_from_list() throws Exception {
        var createResult = mvc.perform(post("/todos")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Delete me"))))
                .andReturn();
        String id = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("id").asText();

        mvc.perform(delete("/todos/" + id)
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isNoContent());

        mvc.perform(get("/todos")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void unauthenticated_request_returns_403() throws Exception {
        mvc.perform(get("/todos"))
                .andExpect(status().isForbidden());
    }

    @Test
    void create_todo_with_blank_title_returns_400() throws Exception {
        mvc.perform(post("/todos")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", ""))))
                .andExpect(status().isBadRequest());
    }
}
