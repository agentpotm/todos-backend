package com.todos.todos.dto;

import com.todos.model.Todo;

import java.time.Instant;
import java.util.UUID;

public record TodoResponse(
        UUID id,
        String title,
        boolean completed,
        Instant createdAt,
        Instant updatedAt
) {
    public static TodoResponse from(Todo todo) {
        return new TodoResponse(
                todo.getId(),
                todo.getTitle(),
                todo.isCompleted(),
                todo.getCreatedAt(),
                todo.getUpdatedAt()
        );
    }
}
