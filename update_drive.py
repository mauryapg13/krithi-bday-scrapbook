#!/usr/bin/env python3
import urllib.request
import re
import json
import codecs
import time
import os

# Main Google Drive Root Folder ID
ROOT_FOLDER_ID = "1OKjD8KParXw26FuAphMXZoO_lCUx2rFM"
ROOT_URL = f"https://drive.google.com/drive/folders/{ROOT_FOLDER_ID}"

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def find_entries(lst):
    entries = []
    if not isinstance(lst, list):
        return entries
    if len(lst) >= 4 and isinstance(lst[0], str) and isinstance(lst[1], list) and isinstance(lst[2], str) and isinstance(lst[3], str) and '/' in lst[3]:
        entries.append(lst)
    for sub in lst:
        if isinstance(sub, list):
            entries.extend(find_entries(sub))
    return entries

def fetch_and_decode(url):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
        
        str_match = re.search(r"window\['_DRIVE_ivd'\]\s*=\s*'([^']*)';", html)
        if not str_match:
            return None
        raw_str = str_match.group(1)
        decoded_bytes, _ = codecs.escape_decode(raw_str.encode('utf-8'))
        return json.loads(decoded_bytes.decode('utf-8'))
    except Exception as e:
        print(f"Error fetching/decoding {url}: {e}")
        return None

def main():
    print(f"Scanning Google Drive Root Folder ({ROOT_FOLDER_ID})...")
    root_data = fetch_and_decode(ROOT_URL)
    if not root_data:
        print("Error: Could not scan root folder. Make sure the folder is shared as public.")
        return

    subfolders = []
    root_files = []

    for item in root_data:
        if isinstance(item, list):
            entries = find_entries(item)
            for entry in entries:
                item_id = entry[0]
                parent_ids = entry[1]
                name = entry[2]
                mime = entry[3]
                
                # Check if it belongs to this root folder
                if ROOT_FOLDER_ID in parent_ids:
                    if mime == "application/vnd.google-apps.folder":
                        subfolders.append({"name": name, "id": item_id})
                    elif '/' in mime and not mime.endswith('folder'):
                        root_files.append({"name": name, "id": item_id, "mime": mime})

    print(f"Found {len(subfolders)} subfolders and {len(root_files)} root files.")

    database = {}
    if root_files:
        database["General"] = [{"id": f["id"], "name": f["name"]} for f in root_files]

    # Alphabetical sorting of subfolder categories
    subfolders.sort(key=lambda x: x["name"].lower())

    for folder in subfolders:
        name = folder["name"]
        folder_id = folder["id"]
        
        if name.startswith(".") or name.lower() == "trash":
            continue
            
        print(f"Scanning subfolder '{name}' ({folder_id})...")
        folder_data = fetch_and_decode(f"https://drive.google.com/drive/folders/{folder_id}")
        
        if not folder_data:
            print(f"  Warning: Could not fetch data for folder '{name}'")
            database[name] = []
            continue

        folder_files = []
        for item in folder_data:
            if isinstance(item, list):
                entries = find_entries(item)
                for entry in entries:
                    item_id = entry[0]
                    parent_ids = entry[1]
                    file_name = entry[2]
                    mime = entry[3]
                    
                    if '/' in mime and not mime.endswith('folder') and folder_id in parent_ids:
                        folder_files.append({"id": item_id, "name": file_name})

        print(f"  Found {len(folder_files)} files in folder '{name}'")
        database[name] = folder_files
        time.sleep(0.8) # Polite crawler delay

    # Generate js/data.js
    dest_dir = "js"
    dest_path = os.path.join(dest_dir, "data.js")
    os.makedirs(dest_dir, exist_ok=True)

    js_content = f"// Automatically generated birthday memories data from Google Drive. DO NOT EDIT DIRECTLY.\nconst MEMORIES_DATA = {json.dumps(database, indent=2)};\n"
    
    with open(dest_path, "w") as f:
        f.write(js_content)

    print(f"\nSUCCESS: Rebuilt '{dest_path}' with {len(database.keys())} active categories.")

if __name__ == "__main__":
    main()
