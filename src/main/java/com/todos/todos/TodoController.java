package com.todos.todos;

import com.todos.model.Todo;
import com.todos.todos.dto.CreateTodoRequest;
import com.todos.todos.dto.TodoResponse;
import com.todos.todos.dto.UpdateTodoRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/todos")
public class TodoController {

    private final TodoService todoService;

    public TodoController(TodoService todoService) {
        this.todoService = todoService;
    }

    @GetMapping
    public List<TodoResponse> list(@AuthenticationPrincipal UUID userId) {
        return todoService.listTodos(userId).stream()
                .map(TodoResponse::from)
                .toList();
    }

    @PostMapping
    public ResponseEntity<TodoResponse> create(@AuthenticationPrincipal UUID userId,
                                               @Valid @RequestBody CreateTodoRequest req) {
        Todo todo = todoService.createTodo(userId, req.title());
        return ResponseEntity.status(HttpStatus.CREATED).body(TodoResponse.from(todo));
    }

    @PatchMapping("/{id}")
    public TodoResponse update(@AuthenticationPrincipal UUID userId,
                               @PathVariable UUID id,
                               @RequestBody UpdateTodoRequest req) {
        Todo todo = todoService.updateTodo(userId, id, req.title(), req.completed());
        return TodoResponse.from(todo);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID id) {
        todoService.deleteTodo(userId, id);
        return ResponseEntity.noContent().build();
    }
}
