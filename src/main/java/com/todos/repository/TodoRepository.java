package com.todos.repository;

import com.todos.model.Todo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TodoRepository extends JpaRepository<Todo, UUID> {
    List<Todo> findByUserIdOrderByCreatedAtAsc(UUID userId);
    Optional<Todo> findByIdAndUserId(UUID id, UUID userId);
}
