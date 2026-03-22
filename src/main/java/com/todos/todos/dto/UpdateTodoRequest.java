package com.todos.todos.dto;

public record UpdateTodoRequest(
        String title,
        Boolean completed
) {}
