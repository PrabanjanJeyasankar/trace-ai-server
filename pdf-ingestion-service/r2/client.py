import os
import hashlib
from typing import Iterable, Optional
from dataclasses import dataclass
from datetime import datetime
import boto3
from botocore.client import Config


@dataclass
class PdfDocument:
    doc_id: str
    object_key: str
    file_name: str
    path: str
    domain: str
    size: int
    last_modified: datetime
    etag: str
    checksum: str
    content_type: Optional[str] = None


class R2Client:
    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket_name: str,
    ):
        endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
        
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(signature_version="s3v4"),
        )
        self.bucket_name = bucket_name

    def list_all_objects(self) -> Iterable[dict]:
        paginator = self.client.get_paginator("list_objects_v2")
        
        for page in paginator.paginate(Bucket=self.bucket_name):
            if "Contents" not in page:
                continue
            
            for obj in page["Contents"]:
                yield obj

    def filter_pdf_objects(self, objects: Iterable[dict]) -> Iterable[dict]:
        for obj in objects:
            key = obj.get("Key", "")
            if key.lower().endswith(".pdf"):
                yield obj

    def extract_domain(self, object_key: str) -> str:
        parts = object_key.split("/")
        if len(parts) <= 1:
            return "general"
        folder_parts = parts[:-1]
        if not folder_parts:
            return "general"
        last_folder = folder_parts[-1]
        # Normalize: singular, lower, replace dashes/spaces, remove trailing s if plural
        domain = last_folder.lower().replace("-", "_").replace(" ", "_")
        if domain.endswith("s") and not domain.endswith("ss"):
            domain = domain[:-1]
        return domain if domain else "general"
    
    def extract_path(self, object_key: str) -> str:
        parts = object_key.split("/")
        if len(parts) <= 1:
            return ""
        return "/".join(parts[:-1]) + "/"
    
    def extract_file_name(self, object_key: str) -> str:
        return object_key.split("/")[-1]
    
    def normalize_etag(self, etag: str) -> str:
        return etag.strip('"')

    def compute_checksum(self, object_key: str) -> str:
        # Download the file and compute SHA-256
        # This is a blocking operation and should be used only for metadata extraction
        file_bytes = self.client.get_object(Bucket=self.bucket_name, Key=object_key)["Body"].read()
        return "sha256:" + hashlib.sha256(file_bytes).hexdigest()

    def build_pdf_document(self, obj: dict) -> PdfDocument:
        object_key = obj["Key"]
        file_name = self.extract_file_name(object_key)
        path = self.extract_path(object_key)
        domain = self.extract_domain(object_key)
        etag = self.normalize_etag(obj.get("ETag", ""))
        size = obj["Size"]
        last_modified = obj["LastModified"]
        # Compute checksum as SHA-256 of file bytes
        checksum = None
        try:
            checksum = self.compute_checksum(object_key)
        except Exception:
            checksum = "sha256:ERROR"
        return PdfDocument(
            doc_id=object_key,
            object_key=object_key,
            file_name=file_name,
            path=path,
            domain=domain,
            size=size,
            last_modified=last_modified,
            etag=etag,
            checksum=checksum,
            content_type=obj.get("ContentType"),
        )

    def discover_pdfs(self) -> list[PdfDocument]:
        all_objects = self.list_all_objects()
        pdf_objects = self.filter_pdf_objects(all_objects)
        
        documents = [self.build_pdf_document(obj) for obj in pdf_objects]
        
        return documents


def list_pdf_objects() -> list[PdfDocument]:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    access_key_id = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID")
    secret_access_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    bucket_name = os.getenv("CLOUDFLARE_R2_BUCKET_NAME")
    
    required_vars = {
        "CLOUDFLARE_ACCOUNT_ID": account_id,
        "CLOUDFLARE_R2_ACCESS_KEY_ID": access_key_id,
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY": secret_access_key,
        "CLOUDFLARE_R2_BUCKET_NAME": bucket_name,
    }
    
    missing = [k for k, v in required_vars.items() if not v]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
    
    client = R2Client(
        account_id=account_id,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        bucket_name=bucket_name,
    )
    
    return client.discover_pdfs()
