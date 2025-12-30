import hashlib


def compute_file_checksum(file_bytes: bytes) -> str:
    return "sha256:" + hashlib.sha256(file_bytes).hexdigest()
