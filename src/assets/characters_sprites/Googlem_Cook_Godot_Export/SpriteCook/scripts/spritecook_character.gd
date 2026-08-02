extends CharacterBody2D

const WALK_SPEED := 140.0
const RUN_SPEED := 220.0
const JUMP_VELOCITY := -320.0

@onready var animated_sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var collision_shape: CollisionShape2D = $CollisionShape2D

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _ready() -> void:
    if animated_sprite.sprite_frames == null:
        return

    if animated_sprite.sprite_frames.has_animation("Idle"):
        animated_sprite.play("Idle")

    var frame_size := _get_first_frame_size()
    var frame_width = frame_size.x
    var frame_height = frame_size.y
    if frame_width > 0 and frame_height > 0 and collision_shape.shape is RectangleShape2D:
        var shape := collision_shape.shape as RectangleShape2D
        shape.size = Vector2(max(16.0, frame_width * 0.42), max(24.0, frame_height * 0.78))
        animated_sprite.position = Vector2(0, -frame_height * 0.08)

func _physics_process(delta: float) -> void:
    if not is_on_floor():
        velocity.y += gravity * delta

    if is_on_floor() and _is_jump_just_pressed():
        velocity.y = JUMP_VELOCITY

    var axis := _get_horizontal_axis()
    var sprinting := Input.is_key_pressed(KEY_SHIFT)
    velocity.x = axis * (RUN_SPEED if sprinting else WALK_SPEED)

    if axis < -0.01:
        animated_sprite.flip_h = true
    elif axis > 0.01:
        animated_sprite.flip_h = false

    move_and_slide()
    _update_animation(axis, sprinting)

func _update_animation(axis: float, sprinting: bool) -> void:
    if animated_sprite.sprite_frames == null:
        return

    var target_animation := "Idle"
    if not is_on_floor():
        target_animation = "Jump" if velocity.y < 0.0 else "Fall"
    elif absf(axis) > 0.01:
        target_animation = "Run" if sprinting else "Walk"

    if animated_sprite.sprite_frames.has_animation(target_animation):
        if animated_sprite.animation != target_animation:
            animated_sprite.play(target_animation)
    elif animated_sprite.sprite_frames.has_animation("Idle") and animated_sprite.animation != "Idle":
        animated_sprite.play("Idle")

func _get_horizontal_axis() -> float:
    var axis := Input.get_axis("ui_left", "ui_right")
    if absf(axis) > 0.01:
        return axis

    if Input.is_key_pressed(KEY_A):
        axis -= 1.0
    if Input.is_key_pressed(KEY_D):
        axis += 1.0
    return clampf(axis, -1.0, 1.0)

func _is_jump_just_pressed() -> bool:
    return Input.is_action_just_pressed("ui_accept") or Input.is_key_pressed(KEY_W)

func _get_first_frame_size() -> Vector2:
    if animated_sprite.sprite_frames == null:
        return Vector2.ZERO
    for animation_name in animated_sprite.sprite_frames.get_animation_names():
        if animated_sprite.sprite_frames.get_frame_count(animation_name) <= 0:
            continue
        var texture := animated_sprite.sprite_frames.get_frame_texture(animation_name, 0)
        if texture != null:
            return texture.get_size()
    return Vector2.ZERO
