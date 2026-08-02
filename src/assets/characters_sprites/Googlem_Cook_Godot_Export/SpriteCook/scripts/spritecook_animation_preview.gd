extends Node2D

@onready var animated_sprite: AnimatedSprite2D = $AnimatedSprite2D

func _ready() -> void:
    if animated_sprite.sprite_frames == null:
        return

    var animation_names := animated_sprite.sprite_frames.get_animation_names()
    if animation_names.size() > 0:
        animated_sprite.play(String(animation_names[0]))
