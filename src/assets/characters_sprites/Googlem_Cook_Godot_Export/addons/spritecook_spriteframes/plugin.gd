@tool
extends EditorPlugin

const ASSETS_DIR := "res://SpriteCook/assets"
const SPRITE_FRAMES_DIR := "res://SpriteCook/sprite_frames"
const CHARACTER_METADATA_PATH := "res://SpriteCook/character_export.spritecook.json"
const CHARACTER_SPRITE_FRAMES_PATH := "res://SpriteCook/sprite_frames/Character.spriteframes.tres"
const CHARACTER_STATES := ["Idle", "Walk", "Run", "Jump", "Fall", "IdleDown", "IdleUp", "IdleRight", "WalkDown", "WalkUp", "WalkRight", "RunDown", "RunUp", "RunRight", "Attack", "Hurt", "Death"]

var build_queued := false

func _enter_tree() -> void:
    _queue_build()

func _queue_build() -> void:
    if build_queued:
        return
    build_queued = true
    call_deferred("_build_spritecook_resources")

func _build_spritecook_resources() -> void:
    build_queued = false
    _ensure_output_dir()

    var built_count := 0
    for metadata_path in _find_animation_metadata_paths():
        if _build_animation_sprite_frames(metadata_path):
            built_count += 1

    if FileAccess.file_exists(CHARACTER_METADATA_PATH):
        _build_character_sprite_frames(CHARACTER_METADATA_PATH)

    if built_count > 0 or FileAccess.file_exists(CHARACTER_METADATA_PATH):
        get_editor_interface().get_resource_filesystem().scan()
        print("[SpriteCook] SpriteFrames resources are ready.")

func _ensure_output_dir() -> void:
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SPRITE_FRAMES_DIR))

func _find_animation_metadata_paths() -> Array[String]:
    var paths: Array[String] = []
    _collect_metadata_paths(ASSETS_DIR, paths)
    paths.sort()
    return paths

func _collect_metadata_paths(dir_path: String, paths: Array[String]) -> void:
    # Walk recursively so animation metadata inside collection subfolders is found.
    var dir := DirAccess.open(dir_path)
    if dir == null:
        return

    dir.list_dir_begin()
    var filename := dir.get_next()
    while not filename.is_empty():
        if filename != "." and filename != "..":
            var full_path := dir_path + "/" + filename
            if dir.current_is_dir():
                _collect_metadata_paths(full_path, paths)
            elif filename.ends_with(".spritecook.json"):
                paths.append(full_path)
        filename = dir.get_next()
    dir.list_dir_end()

func _load_json(path: String) -> Dictionary:
    if not FileAccess.file_exists(path):
        push_warning("[SpriteCook] Missing JSON metadata: %s" % path)
        return {}

    var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
    if typeof(parsed) != TYPE_DICTIONARY:
        push_warning("[SpriteCook] Invalid JSON metadata: %s" % path)
        return {}

    return parsed

func _load_animation_sheet(metadata_path: String) -> Dictionary:
    var metadata = _load_json(metadata_path)
    if String(metadata.get("asset_kind", "")) != "animation":
        return {}

    var texture_path = String(metadata.get("texture_path", ""))
    var texture = load(texture_path) as Texture2D
    if texture == null:
        push_warning("[SpriteCook] Missing texture: %s" % texture_path)
        return {}

    var animation_name = String(metadata.get("animation_name", "Animation"))
    var frame_width = int(metadata.get("frame_width", 0))
    var frame_height = int(metadata.get("frame_height", 0))
    var frame_count = int(metadata.get("frame_count", 0))
    var fps = max(1, int(metadata.get("fps", 8)))
    if frame_width <= 0 or frame_height <= 0 or frame_count <= 0:
        push_warning("[SpriteCook] Invalid frame data: %s" % metadata_path)
        return {}

    var frames: Array[Texture2D] = []
    for index in range(frame_count):
        var atlas := AtlasTexture.new()
        atlas.atlas = texture
        atlas.region = Rect2(index * frame_width, 0, frame_width, frame_height)
        frames.append(atlas)

    return {
        "animation_name": animation_name,
        "sprite_frames_path": String(metadata.get("sprite_frames_path", _default_sprite_frames_path(animation_name))),
        "frame_width": frame_width,
        "frame_height": frame_height,
        "fps": fps,
        "recognized_state": metadata.get("recognized_state", ""),
        "frames": frames,
    }

func _build_animation_sprite_frames(metadata_path: String) -> bool:
    var animation_data = _load_animation_sheet(metadata_path)
    if animation_data.is_empty():
        return false

    var animation_name = String(animation_data.get("animation_name", "Animation"))
    var sprite_frames = _create_sprite_frames()
    _append_animation(sprite_frames, animation_name, animation_data)
    return _save_sprite_frames(sprite_frames, String(animation_data.get("sprite_frames_path", _default_sprite_frames_path(animation_name))))

func _build_character_sprite_frames(package_path: String) -> bool:
    var package_data = _load_json(package_path)
    var animation_paths = package_data.get("animations", {})
    var directional_paths = package_data.get("directionalAnimations", {})
    if typeof(animation_paths) != TYPE_DICTIONARY:
        return false
    if typeof(directional_paths) != TYPE_DICTIONARY:
        directional_paths = {}

    var sprite_frames = _create_sprite_frames()
    var appended_count := 0

    for state_name in CHARACTER_STATES:
        var metadata_path = String(directional_paths.get(state_name, animation_paths.get(state_name, "")))
        if metadata_path.is_empty():
            continue

        var animation_data = _load_animation_sheet(metadata_path)
        if animation_data.is_empty():
            continue

        _append_animation(sprite_frames, state_name, animation_data)
        appended_count += 1

    if appended_count == 0:
        push_warning("[SpriteCook] No character animations were available to build SpriteFrames.")
        return false

    return _save_sprite_frames(sprite_frames, String(package_data.get("sprite_frames_path", CHARACTER_SPRITE_FRAMES_PATH)))

func _create_sprite_frames() -> SpriteFrames:
    var sprite_frames := SpriteFrames.new()
    if sprite_frames.has_animation("default"):
        sprite_frames.remove_animation("default")
    return sprite_frames

func _append_animation(sprite_frames: SpriteFrames, animation_name: String, animation_data: Dictionary) -> void:
    if not sprite_frames.has_animation(animation_name):
        sprite_frames.add_animation(animation_name)
    else:
        sprite_frames.clear(animation_name)

    sprite_frames.set_animation_speed(animation_name, int(animation_data.get("fps", 8)))
    sprite_frames.set_animation_loop(animation_name, true)
    for frame in animation_data.get("frames", []):
        sprite_frames.add_frame(animation_name, frame)

func _save_sprite_frames(sprite_frames: SpriteFrames, output_path: String) -> bool:
    if output_path.is_empty():
        return false
    DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path.get_base_dir()))
    var err := ResourceSaver.save(sprite_frames, output_path)
    if err != OK:
        push_warning("[SpriteCook] Failed to save SpriteFrames: %s" % output_path)
        return false
    return true

func _default_sprite_frames_path(animation_name: String) -> String:
    return SPRITE_FRAMES_DIR + "/" + _sanitize_filename(animation_name) + ".spriteframes.tres"

func _sanitize_filename(value: String) -> String:
    var result := value.strip_edges()
    for invalid in ["<", ">", ":", "/", "|", "?", "*"]:
        result = result.replace(invalid, "_")
    result = result.replace(" ", "_")
    return result if not result.is_empty() else "Animation"
