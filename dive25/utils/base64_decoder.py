# dive25/utils/base64_decoder.py

import base64
import argparse
import sys
from pathlib import Path

def decode_base64_file(input_file: str, output_file: str = None) -> None:
    try:
        with open(input_file, 'r') as f:
            content = f.read().strip()
        
        decoded = base64.b64decode(content)
        
        if not output_file:
            output_file = input_file + '.decoded'
        
        with open(output_file, 'wb') as f:
            f.write(decoded)
            
        print(f"Decoded {input_file} to {output_file}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Decode base64 files')
    parser.add_argument('input', help='Input base64 file')
    parser.add_argument('-o', '--output', help='Output file (optional)')
    args = parser.parse_args()
    
    decode_base64_file(args.input, args.output)