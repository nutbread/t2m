


(function () {
	"use strict";

	// Module for performing actions as soon as possible
	var ASAP = (function () {

		// Variables
		var state = 0;
		var callbacks_asap = [];
		var callbacks_ready = [];
		var callbacks_check = [];
		var callback_check_interval = null;
		var callback_check_interval_time = 20;
		var on_document_readystatechange_interval = null;



		// Events
		var on_document_readystatechange = function () {
			// State check
			if (document.readyState == "interactive") {
				if (state == 0) {
					// Mostly loaded
					state = 1;

					// Callbacks
					var c = callbacks_asap;
					callbacks_asap = null;
					trigger_callbacks(c);
				}
			}
			else if (document.readyState == "complete") {
				// Loaded
				state = 2;

				// Callbacks
				var c;
				if (callbacks_asap !== null) {
					c = callbacks_asap;
					callbacks_asap = null;
					trigger_callbacks(c);
				}

				c = callbacks_ready;
				callbacks_ready = null;
				trigger_callbacks(c);

				// Complete
				clear_events();
			}
		};
		var on_callbacks_check = function () {
			// Test all
			for (var i = 0; i < callbacks_check.length; ++i) {
				if (callback_test.call(null, callbacks_check[i])) {
					// Remove
					callbacks_check.splice(i, 1);
					--i;
				}
			}

			// Stop timer?
			if (callbacks_check.length == 0) {
				clearInterval(callback_check_interval);
				callback_check_interval = null;
			}
		};
		var on_callback_timeout = function (data) {
			// Remove
			for (var i = 0; i < callbacks_check.length; ++i) {
				if (callbacks_check[i] === data) {
					// Update
					data.timeout_timer = null;

					// Callback
					if (data.timeout_callback) data.timeout_callback.call(null);

					// Remove
					callbacks_check.splice(i, 1);
					return;
				}
			}
		};

		// Clear events
		var clear_events = function () {
			if (on_document_readystatechange_interval !== null) {
				// Remove timer
				clearInterval(on_document_readystatechange_interval);
				on_document_readystatechange_interval = null;

				// Remove events
				document.removeEventListener("readystatechange", on_document_readystatechange, false);

				// Clear callbacks
				callbacks_asap = null;
				callbacks_ready = null;
			}
		};

		// Test callback
		var callback_test = function (data) {
			if (!data.condition || data.condition.call(null)) {
				// Call
				data.callback.call(null);

				// Stop timeout
				if (data.timeout_timer !== null) {
					clearTimeout(data.timeout_timer);
					data.timeout_timer = null;
				}

				// Okay
				return true;
			}

			// Not called
			return false;
		};
		var callback_wait = function (data) {
			// Add to list
			callbacks_check.push(data);
			if (callback_check_interval === null) {
				callback_check_interval = setInterval(on_callbacks_check, callback_check_interval_time);
			}

			// Timeout
			if (data.timeout > 0) {
				data.timeout_timer = setTimeout(on_callback_timeout.bind(null, data), data.timeout * 1000);
			}
		};

		// Trigger callback list
		var trigger_callbacks = function (callback_list) {
			for (var i = 0, j = callback_list.length; i < j; ++i) {
				// Test
				if (!callback_test.call(null, callback_list[i])) {
					// Queue
					callback_wait.call(null, callback_list[i]);
				}
			}
		};

		// Add callback
		var add_callback = function (callback, condition, timeout, timeout_callback, target) {
			var cb_data = {
				callback: callback,
				condition: condition || null,
				timeout: timeout || 0,
				timeout_callback: timeout_callback || null,
				timeout_timer: null
			};

			if (target === null) {
				// Test
				if (!callback_test.call(null, cb_data)) {
					// Queue
					callback_wait.call(null, cb_data);
				}
			}
			else {
				// Add
				target.push(cb_data);
			}
		};

		// Setup events
		on_document_readystatechange();
		if (state < 2) {
			document.addEventListener("readystatechange", on_document_readystatechange, false);
			on_document_readystatechange_interval = setInterval(on_document_readystatechange, 20);
		}



		// Return functions
		return {

			/**
				Call a function as soon as possible when the DOM is fully loaded
				(document.readyState == "interactive")

				@param callback
					The callback to be called
					The call format is:
						callback.call(null)
				@param condition
					An additional condition to test for.
					If this condition is falsy, a timeout interval is
					used to continuously test it until it is true (or timed out)
					The call format is:
						condition.call(null)
				@param timeout
					If specified, a maximum time limit is given for the condition to be met
					Must be greater than 0, units are seconds
				@param timeout_callback
					If specified, this is a callback which is called when the condition check
					has timed out
					The call format is:
						timeout_callback.call(null)
			*/
			asap: function (callback, condition, timeout, timeout_callback) {
				// Add to asap
				add_callback.call(null, callback, condition, timeout, timeout_callback, callbacks_asap);
			},
			/**
				Call a function as soon as possible when the DOM is fully loaded
				(document.readyState == "complete")

				@param callback
					The callback to be called
					The call format is:
						callback.call(null)
				@param condition
					An additional condition to test for.
					If this condition is falsy, a timeout interval is
					used to continuously test it until it is true (or timed out)
					The call format is:
						condition.call(null)
				@param timeout
					If specified, a maximum time limit is given for the condition to be met
					Must be greater than 0, units are seconds
				@param timeout_callback
					If specified, this is a callback which is called when the condition check
					has timed out
					The call format is:
						timeout_callback.call(null)
			*/
			ready: function (callback, condition, timeout, timeout_callback) {
				// Add to ready
				add_callback.call(null, callback, condition, timeout, timeout_callback, callbacks_ready);
			},

		};

	})();

	/**
		wrap_mouseenterleave_event = function (callback, self, ...)

		Wrap a mouseover/mouseout event to make it only execute on the correct node (not on child nodes)

		@param callback
			The event callback to be used
			The format is:
			callback.call(self, [...,] event, node)
				self: the same object given from the self parameter
				event: the mouseover/mouseout event
				node: the node triggering the event
				[...]: optional; any extra arguments specified after "callback"
		@param self
			The "this" object the callback should be called with
	*/
	var wrap_mouseenterleave_event = (function () {

		// Handle mouseover/mouseout events to make sure the target is correct
		var on_mouseenterleave_prehandle = function (event, self, callback, extra_args) {
			// Must check for same parent element
			var parent = event.relatedTarget;

			// Find parents
			try {
				while (parent) {
					if (parent === this) return;
					parent = parent.parentNode;
				}
			}
			catch (e) {
				// Problem
				return;
			}

			// Setup event arguments
			extra_args.push(event);
			extra_args.push(this);

			// Trigger event
			return callback.apply(self, extra_args);
		};



		// Return a wrapping function
		return function (callback, self) {
			// Get any extra arguments
			var extra_args = Array.prototype.slice.call(arguments, 2);

			// Return the function wrapped
			return function (event) {
				return on_mouseenterleave_prehandle.call(this, event, self, callback, extra_args);
			};
		};

	})();



	// Functions
	var script_add = (function () {

		var script_on_load = function (state, event) {
			// Okay
			script_remove_event_listeners.call(this, state, true);
		};
		var script_on_error = function (state, event) {
			// Error
			script_remove_event_listeners.call(this, state, false);
		};
		var script_on_readystatechange = function (state, event) {
			if (this.readyState === "loaded" || this.readyState === "complete") {
				// Okay
				script_remove_event_listeners.call(this, state, true);
			}
		};
		var script_remove_event_listeners = function (state, okay) {
			// Remove event listeners
			this.addEventListener("load", state.on_load, false);
			this.addEventListener("error", state.on_error, false);
			this.addEventListener("readystatechange", state.on_readystatechange, false);

			state.on_load = null;
			state.on_error = null;
			state.on_readystatechange = null;

			// Trigger
			if (state.callback) state.callback.call(null, okay, this);

			// Remove
			var par = this.parentNode;
			if (par) par.removeChild(this);
		};



		return function (url, callback) {
			var head = document.head,
				script, state;

			if (!head) {
				// Callback and done
				callback.call(null, false, null);
				return false;
			}

			// Load state
			state = {
				on_load: null,
				on_error: null,
				on_readystatechange: null,
				callback: callback,
			};

			// New script tag
			script = document.createElement("script");
			script.async = true;
			script.setAttribute("src", url);

			// Events
			script.addEventListener("load", (state.on_load = script_on_load.bind(script, state)), false);
			script.addEventListener("error", (state.on_error = script_on_error.bind(script, state)), false);
			script.addEventListener("readystatechange", (state.on_readystatechange = script_on_readystatechange.bind(script, state)), false);

			// Add
			head.appendChild(script);

			// Done
			return true;
		};

	})();

	var on_generic_stop_propagation = function (event) {
		event.stopPropagation();
	};

	var on_exclusive_mode_change = function (flag_node, event) {
		exclusive_mode_update.call(this, flag_node, false);
	};
	var exclusive_mode_update = (function () {
		var previous_fragment = "";

		return function (flag_node, check_fragment) {
			var hash_is_exclusive = (window.location.hash == "#converter.exclusive");

			if (check_fragment) {
				this.checked = hash_is_exclusive;
			}
			else {
				if (this.checked ^ (!hash_is_exclusive)) {
					previous_fragment = window.location.hash;
				}
				window.history.replaceState({}, "", window.location.pathname + (this.checked ? "#converter.exclusive" : previous_fragment));
			}

			if (this.checked) {
				flag_node.classList.add("exclusive_enabled");
			}
			else {
				flag_node.classList.remove("exclusive_enabled");
			}
		};
	})();

	var on_converter_click = function (converter_files_input, event) {
		if (event.which != 2 && event.which != 3) {
			converter_files_input.click();
		}
	};
	var on_converter_files_change = function (converter) {
		// Read
		on_converter_test_files.call(converter, this.files);

		// Nullify
		this.value = null;
	};

	var on_file_dragover = function (converter, event) {
		if (Array.prototype.indexOf.call(event.dataTransfer.types, "Files") < 0) return;

		converter.classList.add("converter_files_active");
		if (this === converter) converter.classList.add("converter_files_hover");

		event.dataTransfer.dropEffect = "copy";
		event.preventDefault();
		event.stopPropagation();
		return false;
	};
	var on_file_dragleave = function (converter, event) {
		if (Array.prototype.indexOf.call(event.dataTransfer.types, "Files") < 0) return;

		converter.classList.remove("converter_files_hover");
		if (this !== converter) converter.classList.remove("converter_files_active");

		event.preventDefault();
		event.stopPropagation();
		return false;
	};
	var on_file_drop = function (converter, event) {
		// Reset style
		converter.classList.remove("converter_files_active");
		converter.classList.remove("converter_files_hover");
		event.preventDefault();
		event.stopPropagation();

		// Not over the converter
		if (this !== converter) return false;

		// Read files
		on_converter_test_files.call(converter, event.dataTransfer.files);

		// Done
		return false;
	};

	var on_converter_test_files = function (files) {
		// Read
		var re_ext = /(\.[^\.]*|)$/,
			read_files = [],
			reader, ext, i;

		for (i = 0; i < files.length; ++i) {
			ext = re_ext.exec(files[i].name)[1].toLowerCase();
			if (ext == ".torrent") {
				read_files.push(files[i]);
			}
		}

		// Nothing to do
		if (read_files.length == 0) return;

		// Load scripts if necessary
		load_requirements(function (errors) {
			if (errors == 0) {
				// Load
				try {
					T2M;
				}
				catch(e) {
					return; // not found
				}
				T2M.queue_torrent_files(read_files);
			}
		});
	};

	var load_requirements = (function () {

		// Script requirements
		var requirements = [
			"src/sha1.js",
			"src/bencode.js",
			"src/base32.js",
			"src/t2m.js",
		];


		var on_all_scripts_loaded = function () {
			try {
				T2M;
			}
			catch(e) {
				return;
			}

			T2M.setup(rice_checkboxes);
		}
		var on_script_load = function (state, callback, okay, node) {
			if (okay) ++state.okay;

			if (++state.count >= state.total) {
				// All loaded/errored
				if (state.total - state.okay == 0) on_all_scripts_loaded();
				callback.call(null, state.total - state.okay);
			}
		};

		// Return the loading function
		return function (callback) {
			// Already loaded?
			if (requirements === null) {
				// Yes
				callback.call(null, 0);
				return;
			}

			var head = document.head,
				on_load, i;

			if (!head) return false;

			// Load
			on_load = on_script_load.bind(null, { okay: 0, count: 0, total: requirements.length, }, callback);
			for (i = 0; i < requirements.length; ++i) {
				script_add(requirements[i], on_load);
			}

			// Done
			requirements = null;
			return true;
		};

	})();

	var restyle_noscript = function () {
		// Script
		var nodes = document.querySelectorAll(".script_disabled"),
			i;

		for (i = 0; i < nodes.length; ++i) {
			nodes[i].classList.remove("script_visible");
		}

		nodes = document.querySelectorAll(".script_enabled");
		for (i = 0; i < nodes.length; ++i) {
			nodes[i].classList.add("script_visible");
		}
	};

	var rice_checkboxes = function (nodes) {
		var nodes = nodes || document.querySelectorAll("input[type=checkbox].checkbox"),
			svgns = "http://www.w3.org/2000/svg",
			i, par, sib, node, n1, n2, n3;

		for (i = 0; i < nodes.length; ++i) {
			node = nodes[i];
			par = node.parentNode;
			sib = node.nextSibling;

			// Create new checkbox
			n1 = document.createElement("label");
			n1.className = node.className;

			n2 = document.createElementNS(svgns, "svg");
			n2.setAttribute("svgns", svgns);
			n2.setAttribute("viewBox", "0 0 16 16");

			n3 = document.createElementNS(svgns, "polygon");
			n3.setAttribute("points", "13,0 16,2 8,16 5,16 0,11 2,8 6,11.5");

			// Re-add
			n2.appendChild(n3);
			n1.appendChild(n2);
			par.insertBefore(n1, node);
			n1.insertBefore(node, n2);
		}
	};



	// Execute
	ASAP.asap(function () {
		// Noscript
		var nodes, i;

		// Rice
		restyle_noscript();
		rice_checkboxes();

		// Stop propagation links
		nodes = document.querySelectorAll(".link_stop_propagation");
		for (i = 0; i < nodes.length; ++i) {
			nodes[i].addEventListener("click", on_generic_stop_propagation, false);
		}

		// Setup converter
		var converter = document.querySelector(".converter"),
			converter_files = document.querySelector(".converter_files_input"),
			exclusive_mode = document.querySelector("input.converter_exclusive_mode_check"),
			non_exclusive_body = document.querySelector(".non_exclusive"),
			body = document.body;

		if (converter !== null) {
			// File browser
			if (converter_files !== null) {
				converter.addEventListener("click", on_converter_click.bind(converter, converter_files), false);
				converter_files.addEventListener("change", on_converter_files_change.bind(converter_files, converter), false);
			}

			// File drag/drop events
			converter.addEventListener("dragover", on_file_dragover.bind(converter, converter), false);
			converter.addEventListener("dragleave", on_file_dragleave.bind(converter, converter), false);
			converter.addEventListener("drop", on_file_drop.bind(converter, converter), false);

			body.addEventListener("dragover", on_file_dragover.bind(body, converter), false);
			body.addEventListener("dragleave", on_file_dragleave.bind(body, converter), false);
			body.addEventListener("drop", on_file_drop.bind(body, converter), false);

			// Exclusive
			if (exclusive_mode !== null) {
				exclusive_mode_update.call(exclusive_mode, non_exclusive_body, true);
				exclusive_mode.addEventListener("change", on_exclusive_mode_change.bind(exclusive_mode, non_exclusive_body), false);
			}
		}
	});

})();


