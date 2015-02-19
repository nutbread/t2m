


var T2M = (function () {
	"use strict";

	// Module for encoding/decoding UTF8
	var UTF8 = (function () {

		return {
			/**
				Encode a string into UTF-8

				@param str
					The string to convert.
					This string should be encoded in some way such that each character is in the range [0,255]
				@return
					A UTF-8 encoded string
			*/
			encode: function (str) {
				return unescape(encodeURIComponent(str));
			},
			/**
				Decode a string from UTF-8

				@param str
					A valid UTF-8 string
				@return
					The original string
			*/
			decode: function (str) {
				return decodeURIComponent(escape(str));
			},
		};

	})();



	// Class for reading .torrent files
	var Torrent = (function () {

		var Torrent = function () {
			this.events = {
				"load": [],
				"error": [],
				"read_error": [],
				"read_abort": [],
			};
			this.file_name = null;
			this.data = null;
		};



		var on_reader_load = function (event) {
			// Decode
			var data_str = event.target.result;

			if (data_str instanceof ArrayBuffer) {
				// Convert to string
				var data_str2 = "",
					i;

				data_str = new Uint8Array(data_str);
				for (i = 0; i < data_str.length; ++i) {
					data_str2 += String.fromCharCode(data_str[i]);
				}

				data_str = data_str2;
			}

			try {
				this.data = Bencode.decode(data_str);
			}
			catch (e) {
				// Throw an error
				this.data = null;
				this.file_name = null;
				trigger.call(this, "error", {
					type: "Bencode error",
					exception: e,
				});
				return;
			}

			// Loaded
			trigger.call(this, "load", {});
		};
		var on_reader_error = function () {
			trigger.call(this, "read_error", {});
		};
		var on_reader_abort = function () {
			trigger.call(this, "read_abort", {});
		};
		var trigger = function (event, data) {
			// Trigger an event
			var callbacks = this.events[event],
				i;

			for (i = 0; i < callbacks.length; ++i) {
				callbacks[i].call(this, data, event);
			}
		};
		var no_change = function (x) {
			return x;
		};

		var magnet_component_order_default = [ "xt" , "xl" , "dn" , "tr" ];

		var format_uri = function (array_values, encode_fcn) {
			if (array_values.length <= 1) return encode_fcn(array_values[0]);

			return array_values[0].replace(/\{([0-9]+)\}/, function (match) {
				return encode_fcn(array_values[parseInt(match[1], 10) + 1] || "");
			});
		};



		/**
			Convert URI components object into a magnet URI.
			This is used to format the same object multiple times without rehashing anything.

			@param link_components
				An object returned from convert_to_magnet with return_components=true
			@param custom_name
				Can take one of the following values:
					null/undefined: name will remain the same as it originally was
					string: the custom name to give the magnet URI
			@param tracker_mode
				Can take one of the following values:
					null/undefined/false/number < 0: single tracker only (primary one)
					true: multiple trackers (without numbered suffix)
					number >= 0: multiple trackers (with numbered suffix starting at the specified number)
			@param uri_encode
				Can take one of the following values:
					null/undefined/true: encode components using encodeURIComponent
					false: no encoding; components are left as-is
					function: custom encoding function
			@param component_order
				A list containing the order URI components should appear in.
				Default is [ "xt" , "xl" , "dn" , "tr" ]
				null/undefined will use the default
			@return
				A formatted URI
		*/
		Torrent.components_to_magnet = function (link_components, custom_name, tracker_mode, uri_encode, component_order) {
			// Vars
			var link, obj, list1, val, i, j;

			uri_encode = (uri_encode === false) ? no_change : (typeof(uri_encode) == "function" ? uri_encode : encodeURIComponent);
			component_order = (component_order === null) ? magnet_component_order_default : component_order;

			// Setup
			if (typeof(custom_name) == "string") {
				link_components.dn.values = [ custom_name ];
			}

			link_components.tr.suffix = -1;
			if (typeof(tracker_mode) == "number") {
				tracker_mode = Math.floor(tracker_mode);
				if (tracker_mode >= 0) link_components.tr.suffix = tracker_mode;
			}
			else if (tracker_mode === true) {
				link_components.tr.suffix = -2;
			}

			// Form into a URL
			link = "magnet:";
			val = 0; // number of components added
			for (i = 0; i < component_order.length; ++i) {
				if (!(component_order[i] in link_components)) continue; // not valid
				obj = link_components[component_order[i]];
				list1 = obj.values;
				for (j = 0; j < list1.length; ++j) {
					// Separator
					link += (val === 0 ? "?" : "&");
					++val;

					// Key
					link += component_order[i];

					// Number
					if (obj.suffix >= 0 && list1.length > 1) {
						link += ".";
						link += obj.suffix;
						++obj.suffix;
					}

					// Value
					link += "=";
					link += format_uri(list1[j], uri_encode);

					// Done
					if (obj.suffix == -1) break;
				}
			}

			// Done
			return link;
		};



		Torrent.prototype = {
			constructor: Torrent,

			read: function (file) {
				this.data = null;
				this.file_name = file.name;

				var reader = new FileReader();

				reader.addEventListener("load", on_reader_load.bind(this), false);
				reader.addEventListener("error", on_reader_error.bind(this), false);
				reader.addEventListener("abort", on_reader_abort.bind(this), false);

				try {
					reader.readAsBinaryString(file);
				}
				catch (e) {
					reader.readAsArrayBuffer(file);
				}
			},

			on: function (event, callback) {
				if (event in this.events) {
					this.events[event].push(callback);
					return true;
				}
				return false;
			},
			off: function (event, callback) {
				if (event in this.events) {
					var callbacks = this.events[event],
						i;

					for (i = 0; i < callbacks.length; ++i) {
						if (callbacks[i] == callback) {
							callbacks.splice(i, 1);
							return true;
						}
					}
				}
				return false;
			},

			/**
				Convert the torrent data into a magnet link.

				@param custom_name
					Can take one of the following values:
						null/undefined: no custom name will be generated, but if the name field is absent, it will be assumed from the original file's name
						false: no custom name will be generated OR assumed from the original file name
						string: the custom name to give the magnet URI
				@param tracker_mode
					Can take one of the following values:
						null/undefined/false/number < 0: single tracker only (primary one)
						true: multiple trackers (without numbered suffix)
						number >= 0: multiple trackers (with numbered suffix starting at the specified number)
				@param uri_encode
					Can take one of the following values:
						null/undefined/true: encode components using encodeURIComponent
						false: no encoding; components are left as-is
						function: custom encoding function
				@param component_order
					A list containing the order URI components should appear in.
					Default is [ "xt" , "xl" , "dn" , "tr" ]
					null/undefined will use the default
				@param return_components
					If true, this returns the link components which can then be used with components_to_magnet
				@return
					A formatted URI if return_components is falsy, else an object containing the parts of the link
					Also can return null if insufficient data is found
			*/
			convert_to_magnet: function (custom_name, tracker_mode, uri_encode, component_order, return_components) {
				// Insufficient data
				if (this.data === null || !("info" in this.data)) return null;

				// Bencode info
				var info = this.data.info,
					info_bencoded = Bencode.encode(info),
					info_hasher = new SHA1(),
					link_components = {},
					info_hash, link, list1, list2, val, i, j;

				// Hash
				info_hasher.update(info_bencoded);
				info_hash = info_hasher.digest();
				info_hash = String.fromCharCode.apply(null, info_hash); // convert to binary string
				info_hash = Base32.encode(info_hash); // convert to base32

				// Setup link
				for (i = 0; i < magnet_component_order_default.length; ++i) {
					link_components[magnet_component_order_default[i]] = {
						suffix: -1,
						values: [],
					};
				}

				// Create
				link_components.xt.values.push([ "urn:btih:{0}", info_hash ]);

				if ("length" in info) {
					link_components.xl.values.push([ info.length ]);
				}

				if (typeof(custom_name) == "string") {
					link_components.dn.values.push([ custom_name ]);
				}
				else if ("name" in info) {
					link_components.dn.values.push([ UTF8.decode(info.name) ]);
				}
				else if (custom_name !== false && this.file_name) {
					link_components.dn.values.push([ this.file_name ]);
				}

				list1 = link_components.tr.values;
				if ("announce" in this.data) {
					list1.push([ UTF8.decode(this.data.announce) ]);
				}
				if ("announce-list" in this.data && Array.isArray(list2 = this.data["announce-list"])) {
					// Add more trackers
					for (i = 0; i < list2.length; ++i) {
						if (!Array.isArray(list2[i])) continue; // bad data
						for (j = 0; j < list2[i].length; ++j) {
							val = UTF8.decode(list2[i][j]);
							if (list1.indexOf(val) < 0) list1.push([ val ]);
						}
					}
				}

				// Convert
				if (return_components) return link_components;
				link = Torrent.components_to_magnet(link_components, null, tracker_mode, uri_encode, component_order);

				// Done
				return link;
			},
		};



		return Torrent;

	})();



	// Class for enumerating the results in the DOM
	var Result = (function () {

		var Result = function () {
			this.torrent_magnet_components = null;

			this.container = null;
			this.magnet_link = null;
			this.magnet_link_text = null;
			this.magnet_textbox = null;
			this.options_link = null;
			this.options_container = null;
			this.options = null;
		};



		var on_options_link_click = function () {
			if (this.options_container.classList.contains("converted_item_options_container_visible")) {
				this.options_container.classList.remove("converted_item_options_container_visible");
				this.magnet_textbox.readOnly = true;
			}
			else {
				this.options_container.classList.add("converted_item_options_container_visible");
				this.magnet_textbox.readOnly = false;
			}
		};

		var on_textbox_click = function () {
			if (this.magnet_textbox.readOnly) {
				this.magnet_textbox.select();
			}
		};
		var on_textbox_keydown = function () {
			if (this.magnet_textbox.readOnly) return;

			setTimeout(on_textbox_update.bind(this), 10);
		};
		var on_textbox_change = function () {
			on_textbox_update.call(this);
		};
		var on_textbox_update = function () {
			// Get value
			var uri = this.magnet_textbox.value,
				protocol = "magnet:";

			// Must have correct protocol
			if (uri.substr(0, protocol.length).toLowerCase() != protocol) {
				if (uri.length < protocol.length && uri.toLowerCase() == protocol.substr(0, uri.length)) {
					// Almost correct
					uri += protocol.substr(uri.length);
				}
				else {
					// Wrong
					uri = protocol + uri;
				}
			}

			// Update
			this.magnet_link.setAttribute("href", uri);
			this.magnet_link_text.textContent = uri;
		};

		var on_option_change = function () {
			update_links.call(this, true);
		};

		var update_links = function (update_displays) {
			// Update magnet links
			var magnet_uri = "magnet:asdf",
				tracker_mode = false,
				order = [ "xt" ];

			if (this.options[0][0][1].checked) {
				order.push("dn");
			}
			if (this.options[1][0][1].checked) {
				order.push("xl");
			}
			if (this.options[2][0][1].checked) {
				order.push("tr");
				if (this.options[2][1][1].checked) {
					tracker_mode = true;
					if (this.options[2][2][1].checked) {
						tracker_mode = 1;
					}
				}
			}

			magnet_uri = Torrent.components_to_magnet(this.torrent_magnet_components, null, tracker_mode, true, order);

			// Update text/values
			this.magnet_link.setAttribute("href", magnet_uri);
			this.magnet_link_text.textContent = magnet_uri;
			this.magnet_textbox.value = magnet_uri;

			if (!update_displays) return;

			// Update display
			var i, j, opt_list;
			for (i = 0; i < this.options.length; ++i) {
				opt_list = this.options[i];

				for (j = 0; j < opt_list.length; ++j) {
					if (!opt_list[j][1].checked) {
						// This is unchecked; modify boxes after
						opt_list[j][0].classList.add("converted_item_option_part_visible");
						// Hide
						while (++j < opt_list.length) {
							opt_list[j][0].classList.remove("converted_item_option_part_visible");
							opt_list[j][1].checked = false;
						}
						break;
					}
				}
			}
		};



		Result.prototype = {
			constructor: Result,

			generate: function (torrent_object, parent_node) {
				var n1, n2, n3, n4, n5, i, j, ev_bind;

				// Clear
				this.options = [];


				//{ Setup DOM nodes
				this.container = document.createElement("div");
				this.container.className = "converted_item";


				// Title
				n1 = document.createElement("div");
				n1.className = "converted_item_title_container";

				n2 = document.createElement("div");
				n2.className = "converted_item_title";
				n2.textContent = torrent_object.file_name || (torrent_object.data && torrent_object.data.info ? torrent_object.data.name : null) || ".torrent";

				n1.appendChild(n2);
				this.container.appendChild(n1);

				// Contents
				n1 = document.createElement("div");
				n1.className = "converted_item_contents";

				// Links
				n2 = document.createElement("div");
				n2.className = "converted_item_link_container";

				this.magnet_link = document.createElement("a");
				this.magnet_link.className = "converted_item_link";

				this.magnet_link_text = document.createElement("span");

				this.magnet_link.appendChild(this.magnet_link_text);
				n2.appendChild(this.magnet_link);

				this.magnet_textbox = document.createElement("input");
				this.magnet_textbox.className = "converted_item_textbox";
				this.magnet_textbox.setAttribute("type", "text");
				this.magnet_textbox.readOnly = true;

				n2.appendChild(this.magnet_textbox);
				n1.appendChild(n2);


				// Options container
				this.options_container = document.createElement("div");
				this.options_container.className = "converted_item_options_container";

				// Header
				n2 = document.createElement("div");
				n2.className = "converted_item_header";

				n3 = document.createElement("span");
				n3.className = "converted_item_header_text";
				n3.textContent = "Options:";

				n2.appendChild(n3);

				this.options_link = document.createElement("a");
				this.options_link.className = "converted_item_options_toggle";

				n3 = document.createElement("span");
				this.options_link.appendChild(n3);

				n2.appendChild(this.options_link);
				this.options_container.appendChild(n2);


				// Options
				n2 = document.createElement("div");
				n2.className = "converted_item_options";

				// Name
				this.options.push([]);

				n3 = document.createElement("div");
				n3.className = "converted_item_option";

				n4 = document.createElement("label");
				n4.className = "converted_item_option_part converted_item_option_part_visible";

				n5 = document.createElement("input");
				n5.className = "converted_item_option_checkbox checkbox";
				n5.setAttribute("type", "checkbox");
				n5.checked = true;
				n4.appendChild(n5);

				this.options[this.options.length - 1].push([ n4 , n5 ]);

				n5 = document.createElement("span");
				n5.className = "converted_item_option_text";
				n5.textContent = "Include name";
				n4.appendChild(n5);

				n3.appendChild(n4);
				n2.appendChild(n3);


				// Data length
				this.options.push([]);

				n3 = document.createElement("div");
				n3.className = "converted_item_option";

				n4 = document.createElement("label");
				n4.className = "converted_item_option_part converted_item_option_part_visible";

				n5 = document.createElement("input");
				n5.className = "converted_item_option_checkbox checkbox";
				n5.setAttribute("type", "checkbox");
				n5.checked = true;
				n4.appendChild(n5);

				this.options[this.options.length - 1].push([ n4 , n5 ]);

				n5 = document.createElement("span");
				n5.className = "converted_item_option_text";
				n5.textContent = "Include data length";
				n4.appendChild(n5);

				n3.appendChild(n4);
				n2.appendChild(n3);


				// Tracker
				this.options.push([]);

				n3 = document.createElement("div");
				n3.className = "converted_item_option";

				n4 = document.createElement("label");
				n4.className = "converted_item_option_part converted_item_option_part_visible";

				n5 = document.createElement("input");
				n5.className = "converted_item_option_checkbox checkbox";
				n5.setAttribute("type", "checkbox");
				n5.checked = true;
				n4.appendChild(n5);

				this.options[this.options.length - 1].push([ n4 , n5 ]);

				n5 = document.createElement("span");
				n5.className = "converted_item_option_text";
				n5.textContent = "Include tracker";
				n4.appendChild(n5);

				n3.appendChild(n4);


				n4 = document.createElement("label");
				n4.className = "converted_item_option_part converted_item_option_part_visible";

				n5 = document.createElement("input");
				n5.className = "converted_item_option_checkbox checkbox";
				n5.setAttribute("type", "checkbox");
				n5.checked = false;
				n4.appendChild(n5);

				this.options[this.options.length - 1].push([ n4 , n5 ]);

				n5 = document.createElement("span");
				n5.className = "converted_item_option_text";
				n5.textContent = "Allow multiple trackers";
				n4.appendChild(n5);

				n3.appendChild(n4);


				n4 = document.createElement("label");
				n4.className = "converted_item_option_part";

				n5 = document.createElement("input");
				n5.className = "converted_item_option_checkbox checkbox";
				n5.setAttribute("type", "checkbox");
				n5.checked = false;
				n4.appendChild(n5);

				this.options[this.options.length - 1].push([ n4 , n5 ]);

				n5 = document.createElement("span");
				n5.className = "converted_item_option_text";
				n5.textContent = "Numbered keys";
				n4.appendChild(n5);

				n3.appendChild(n4);
				n2.appendChild(n3);


				// Add options
				this.options_container.appendChild(n2);
				n1.appendChild(this.options_container);


				// Done
				this.container.appendChild(n1);
				//}


				// Data
				this.torrent_magnet_components = torrent_object.convert_to_magnet(null, false, true, null, true);
				update_links.call(this, false);


				// Events
				this.options_link.addEventListener("click", on_options_link_click.bind(this), false);
				this.magnet_textbox.addEventListener("click", on_textbox_click.bind(this), false);
				this.magnet_textbox.addEventListener("keydown", on_textbox_keydown.bind(this), false);
				this.magnet_textbox.addEventListener("change", on_textbox_change.bind(this), false);

				ev_bind = on_option_change.bind(this);
				for (i = 0; i < this.options.length; ++i) {
					for (j = 0; j < this.options[i].length; ++j) {
						this.options[i][j][1].addEventListener("change", ev_bind, false);
					}
				}


				// Rice and add
				if (rice_checkboxes) {
					rice_checkboxes(this.container.querySelectorAll("input[type=checkbox].checkbox"));
				}
				if (parent_node) parent_node.appendChild(this.container);

			},
			update: function () {

			},
		};



		return Result;

	})();



	// Other functions
	var rice_checkboxes = null;
	var on_torrent_load = function () {
		var container = document.querySelector(".converted"),
			result;

		if (container === null) return;

		container.classList.add("converted_visible");

		result = new Result();
		result.generate(this, container);
	};



	// Exposed functions
	var functions = {
		setup: function (rice_checkboxes_import) {
			rice_checkboxes = rice_checkboxes_import;
		},
		queue_torrent_files: function (files) {
			// Read files
			var i, t;

			for (i = 0; i < files.length; ++i) {
				t = new Torrent();
				t.on("load", on_torrent_load);
				t.read(files[i]);
			}
		},
	};

	return functions;

})();


