package com.todos.todos;

import com.todos.model.Todo;
import com.todos.model.User;
import com.todos.repository.TodoRepository;
import com.todos.repository.UserRepository;
import com.todos.websocket.TodoBroadcaster;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class TodoService {

    private final TodoRepository todoRepo;
    private final UserRepository userRepo;
    private final TodoBroadcaster broadcaster;

    public TodoService(TodoRepository todoRepo, UserRepository userRepo, TodoBroadcaster broadcaster) {
        this.todoRepo = todoRepo;
        this.userRepo = userRepo;
        this.broadcaster = broadcaster;
    }

    public List<Todo> listTodos(UUID userId) {
        return todoRepo.findByUserIdOrderByCreatedAtAsc(userId);
    }

    @Transactional
    public Todo createTodo(UUID userId, String title) {
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Todo todo = todoRepo.save(new Todo(user, title));
        broadcaster.broadcast(userId, "todo:created", todo);
        return todo;
    }

    @Transactional
    public Todo updateTodo(UUID userId, UUID todoId, String title, Boolean completed) {
        Todo todo = todoRepo.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Todo not found"));
        if (title != null) todo.setTitle(title);
        if (completed != null) todo.setCompleted(completed);
        todo = todoRepo.save(todo);
        broadcaster.broadcast(userId, "todo:updated", todo);
        return todo;
    }

    @Transactional
    public void deleteTodo(UUID userId, UUID todoId) {
        Todo todo = todoRepo.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Todo not found"));
        todoRepo.delete(todo);
        broadcaster.broadcastDelete(userId, todoId);
    }
}
