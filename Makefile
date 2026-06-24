.PHONY: serve manifests

serve: manifests
	GOOGLE_CLOUD_REGION=us-central1 node --watch planning-server.js

manifests:
	@for trip in trips/*/; do \
		dir="$${trip}locations"; \
		[ -d "$$dir" ] || continue; \
		(cd "$$dir" && ls -d */ 2>/dev/null | sed 's|/$$||' | sort | sed 's|^|- |') > "$$dir/locations.yaml"; \
		echo "Generated $$dir/locations.yaml"; \
	done
