extends CharacterBody3D

const WALK_SPEED := 4.0
const RUN_SPEED := 6.0

@onready var animated_sprite: AnimatedSprite3D = $AnimatedSprite3D

var last_direction := "Down"

func _ready() -> void:
    animated_sprite.pixel_size = 0.02
    animated_sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
    animated_sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
    _play_state("IdleDown")

func _physics_process(delta: float) -> void:
    var input_vector := Vector2.ZERO
    input_vector.x = Input.get_axis("ui_left", "ui_right")
    input_vector.y = Input.get_axis("ui_down", "ui_up")
    if Input.is_key_pressed(KEY_A):
        input_vector.x -= 1.0
    if Input.is_key_pressed(KEY_D):
        input_vector.x += 1.0
    if Input.is_key_pressed(KEY_W):
        input_vector.y += 1.0
    if Input.is_key_pressed(KEY_S):
        input_vector.y -= 1.0
    input_vector = input_vector.limit_length(1.0)

    var sprinting := Input.is_key_pressed(KEY_SHIFT)
    var speed := RUN_SPEED if sprinting else WALK_SPEED
    velocity = Vector3(input_vector.x, 0.0, -input_vector.y) * speed
    move_and_slide()
    _update_animation(input_vector, sprinting)

func _update_animation(input_vector: Vector2, sprinting: bool) -> void:
    if animated_sprite.sprite_frames == null:
        return

    if input_vector.length_squared() <= 0.01:
        _play_state("Idle" + last_direction)
        return

    var action := "Run" if sprinting else "Walk"
    if absf(input_vector.x) > absf(input_vector.y):
        last_direction = "Right"
        animated_sprite.flip_h = input_vector.x < 0.0
        _play_state(action + "Right")
    elif input_vector.y > 0.0:
        last_direction = "Up"
        animated_sprite.flip_h = false
        _play_state(action + "Up")
    else:
        last_direction = "Down"
        animated_sprite.flip_h = false
        _play_state(action + "Down")

func _play_state(state_name: String) -> void:
    var fallbacks = {
        "IdleDown": ["IdleDown", "Idle", "WalkDown", "WalkRight"],
        "IdleUp": ["IdleUp", "Idle", "WalkUp", "WalkDown"],
        "IdleRight": ["IdleRight", "Idle", "WalkRight", "WalkDown"],
        "WalkDown": ["WalkDown", "Walk", "RunDown", "IdleDown", "Idle"],
        "WalkUp": ["WalkUp", "WalkDown", "Walk", "IdleUp", "Idle"],
        "WalkRight": ["WalkRight", "Walk", "RunRight", "IdleRight", "Idle"],
        "RunDown": ["RunDown", "WalkDown", "Run", "Walk", "IdleDown", "Idle"],
        "RunUp": ["RunUp", "WalkUp", "RunDown", "WalkDown", "Run", "Walk", "Idle"],
        "RunRight": ["RunRight", "WalkRight", "Run", "Walk", "Idle"],
    }
    for candidate in fallbacks.get(state_name, [state_name, "IdleDown", "Idle"]):
        if animated_sprite.sprite_frames.has_animation(candidate):
            if animated_sprite.animation != candidate:
                animated_sprite.play(candidate)
            return
