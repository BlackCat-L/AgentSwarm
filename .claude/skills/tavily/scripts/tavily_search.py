#!/usr/bin/env python3
"""
Tavily AI Search - Optimized search for LLMs and AI applications
No external dependencies needed (uses urllib from stdlib + TAVILY_API_KEY env)
"""

import argparse
import json
import sys
import os
import urllib.request
import urllib.error
from typing import Optional, List


TAVILY_API_URL = "https://api.tavily.com/search"


def search(
    query: str,
    api_key: str,
    search_depth: str = "basic",
    topic: str = "general",
    max_results: int = 5,
    include_answer: bool = True,
    include_raw_content: bool = False,
    include_images: bool = False,
    include_domains: Optional[List[str]] = None,
    exclude_domains: Optional[List[str]] = None,
) -> dict:
    """
    Execute a Tavily search query via direct REST API.
    """
    if not api_key:
        return {
            "error": "Tavily API key required. Set TAVILY_API_KEY env var or pass --api-key",
            "setup_instructions": "Set TAVILY_API_KEY environment variable or pass --api-key"
        }

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": search_depth,
        "topic": topic,
        "max_results": max_results,
        "include_answer": include_answer,
        "include_raw_content": include_raw_content,
        "include_images": include_images,
    }

    if include_domains:
        payload["include_domains"] = include_domains
    if exclude_domains:
        payload["exclude_domains"] = exclude_domains

    try:
        req = urllib.request.Request(
            TAVILY_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        return {
            "success": True,
            "query": query,
            "answer": data.get("answer"),
            "results": data.get("results", []),
            "images": data.get("images", []),
            "response_time": data.get("response_time"),
            "usage": data.get("usage", {}),
        }

    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
        except Exception:
            err_body = {"raw": str(e)}
        return {"error": f"HTTP {e.code}: {err_body}", "query": query}
    except Exception as e:
        return {"error": str(e), "query": query}


def main():
    parser = argparse.ArgumentParser(
        description="Tavily AI Search - Optimized search for LLMs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "What is quantum computing?"
  %(prog)s "Climate change solutions" --depth advanced --max-results 10
  %(prog)s "AI developments" --topic news
  %(prog)s "Python tutorials" --include-domains python.org
        """
    )

    parser.add_argument("query", help="Search query")
    parser.add_argument("--api-key", help="Tavily API key (or set TAVILY_API_KEY env var)")
    parser.add_argument("--depth", choices=["basic", "advanced"], default="basic",
                        help="Search depth")
    parser.add_argument("--topic", choices=["general", "news"], default="general",
                        help="Search topic")
    parser.add_argument("--max-results", type=int, default=5, help="Max results (1-10)")
    parser.add_argument("--no-answer", action="store_true", help="Exclude AI answer summary")
    parser.add_argument("--raw-content", action="store_true", help="Include raw HTML content")
    parser.add_argument("--images", action="store_true", help="Include images")
    parser.add_argument("--include-domains", nargs="+", help="Domains to include")
    parser.add_argument("--exclude-domains", nargs="+", help="Domains to exclude")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")

    args = parser.parse_args()
    api_key = args.api_key or os.getenv("TAVILY_API_KEY")

    result = search(
        query=args.query,
        api_key=api_key,
        search_depth=args.depth,
        topic=args.topic,
        max_results=args.max_results,
        include_answer=not args.no_answer,
        include_raw_content=args.raw_content,
        include_images=args.images,
        include_domains=args.include_domains,
        exclude_domains=args.exclude_domains,
    )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)

        print(f"Query: {result['query']}")
        print(f"Response time: {result.get('response_time', 'N/A')}s")
        print(f"Credits used: {result.get('usage', {}).get('credits', 'N/A')}\n")

        if result.get("answer"):
            print("=== AI ANSWER ===")
            print(result["answer"])
            print()

        if result.get("results"):
            print("=== RESULTS ===")
            for i, item in enumerate(result["results"], 1):
                print(f"\n{i}. {item.get('title', 'No title')}")
                print(f"   URL: {item.get('url', 'N/A')}")
                print(f"   Score: {item.get('score', 'N/A'):.3f}")
                if item.get("content"):
                    content = item["content"]
                    if len(content) > 200:
                        content = content[:200] + "..."
                    print(f"   {content}")

        if result.get("images"):
            print(f"\n=== IMAGES ({len(result['images'])}) ===")
            for img_url in result["images"][:5]:
                print(f"   {img_url}")


if __name__ == "__main__":
    main()
