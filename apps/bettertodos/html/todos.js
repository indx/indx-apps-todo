/* global angular, $, console, _ */
angular
	.module('todos', ['ui', 'indx'])
	.controller('todos', function ($scope, client, utils, staged) {
		'use strict';

		var urgencies = ['low', 'med', 'high', 'urgent'];

		var u = utils,
			newList,
			newTodo,
			app,
			box;

		var specialLists = [
			new Backbone.Model({ id: 'todo-list-all', title: ['All todos'], special: ['all'], todos: [] }),
			new Backbone.Model({ id: 'todo-list-completed', title: ['Completed'], special: ['completed'], todos: [] })
		];

		// Wait until user is logged in and a box has been selected
		var init = function (b) {
			console.log('init');

			box = b;
			$scope.box = b; // FIXME remove (just for console use)

			box.getObj('todoApp').then(function (a) {
				app = a;
				if (!app.has('lists')) { app.set('lists', []); }
				updateLists();
				app.on('change:lists', updateLists);
				u.safeApply($scope);
			});

		};

		// watches for login or box changes
		$scope.$watch('selectedBox + selectedUser', function () {
			delete $scope.msg;
			if (!$scope.selectedUser) {
				$scope.msg = 'Please log in.';
			} else if (!$scope.selectedBox) {
				$scope.msg = 'Please select a box.';
			} else {
				client.store.getBox($scope.selectedBox)
					.then(function (box) { init(box); })
					.fail(function (e) { u.error('error ', e); $scope.msg = 'An error occured.'; });
			}
			
		});

		// todo - check box is defined (or put in init)
		$scope.createList = function () {
			box.getObj('todoList-'  + u.uuid()).then(function (list) {
				list.set({ title: [''], 'todos': [] });
				newList = list;
				updateLists();
				list.isCreated = function () { return false; }
				$scope.editList(list);
			});
		};

		$scope.editList = function (list) {
			state.editingList = list;
			list.showDropdown = false;
		};

		$scope.selectList = function (list) {
			if (state.selectedList) {
				state.selectedList.off('change:todos', updateTodos);
			}
			state.selectedList = list;
			updateTodos();
			list.on('change:todos', updateTodos);
		};

		$scope.deleteList = function (list) {
			list.destroy().then(function () {
				var lists = [].concat(app.get('lists'));
				lists.splice(lists.indexOf(list), 1);
				app.save('lists', lists).then(function () {
					if (state.selectedList === list) {
						delete state.selectedList;
					}
					updateLists();
				});
			});
		};

		$scope.cancelEditList = function () {
			if (!state.editingList) { return; }
			console.log('cancel', state.editingList)
			state.editingList.staged.reset();
			delete state.editingList;
			newList = undefined;
			updateLists();
		};

		$scope.saveList = function (list) {
			var dfd = $.Deferred();
			list.loading = true;
			if (list.staged.get('title')[0] === '') {
				dfd.reject();
			} else {
				list.staged.save().then(function () {
					list.isCreated = function () { return true; }
					console.log('SAVED', list.get('title'),app.get('lists'), [list])
					if (list === newList) {
						newList = undefined;
						app.save('lists', app.get('lists').concat([list])).then(function () {
							dfd.resolve();
						});
					} else {
						dfd.resolve();
					}
				});
			}
			dfd.then(function () {
				delete state.editingList;
				updateLists();
			}).always(function () {
				delete list.loading;
			});
		};

		$scope.countTodos = function (list) {
			return list.get('todos').length;
		};


		var updateLists = function () {
			console.log('UPDATING LISTS', app.get('lists'));
			// update special lists;
			var specialAll = _.findWhere(specialLists, { id: 'todo-list-all' }),
				specialCompleted = _.findWhere(specialLists, { id: 'todo-list-completed' });

			specialAll.set('todos', _.reduce(app.get('lists'), function (memo, list) {
				return memo.concat(list.get('todos') || []);
			}, []));

			specialCompleted.set('todos', _.filter(specialAll.get('todos'), function (todo) {
				return (todo.get('completed') || [])[0];
			}));

			_.each(app.get('lists'), function (list) {
				if (!list.has('title')) { list.set('title', ['Untitled list']) }
				if (!list.has('todos')) { list.set('todos', []) }
				list.isCreated = function () { return true; }
			});

			$scope.lists = [].concat(app.get('lists'));
			$scope.normalLists = [].concat(app.get('lists'));

			delete state.isFirstList;
			if ($scope.lists.length === 0) {
				state.isFirstList = true;
			}
			if (newList) { $scope.lists.push(newList); }

			if ($scope.lists.length === 0) {
				$scope.createList();
				return;
			}

			$scope.lists = $scope.lists.concat(specialLists);

			_.each($scope.lists, function (list) {
				if (!list.staged) { staged(list); }
			})

			if (!state.selectedList) { $scope.selectList($scope.lists[0]); }

			$update();
		}

		var $update = function () {
			console.log('$UPDATE', state.editingList)
			u.safeApply($scope);
		};

		$scope.bodyClick = function () {
			console.log(this)
			$scope.lists.forEach(function (list) {
				list.showDropdown = false;
			});
		};



		// todo - check box is defined (or put in init)
		$scope.createTodoBefore = function (next) {
			box.getObj('todo-'  + u.uuid()).then(function (todo) {
				var nextOrder = next ? next.get('order')[0] : 0,
					prev = _.chain(state.selectedList.get('todos')).sortBy(function (_todo) {
						return -_todo.get('order')[0];
					}).find(function (_todo) {
						return !next || (_todo.get('order')[0] < nextOrder);
					}).value(),
					prevOrder = prev ? prev.get('order')[0] : 0,
					order = 0;

				if (next && prev) {
					order = prevOrder + (nextOrder - prevOrder) / 2
				} else if (prev) {
					order = prevOrder + 1;
				}

				console.log('NP', /*next, prev, */nextOrder, prevOrder, order)
				todo.set({ title: [''], order: [order] });
				newTodo = todo;
				updateTodos();
			});
		};


		$scope.cancelEditTodo = function (todo) {
			console.log(todo);
			if (!todo) { return; }
			todo.staged.reset();
			newTodo = undefined;
			updateTodos();
		};

		$scope.saveTodo = function (todo) {
			var dfd = $.Deferred(),
				list = state.selectedList;
			todo.loading = true;
			if (todo.staged.get('title')[0] === '') { // delete the todo
				if (todo === newTodo) {
					newTodo = undefined;
					dfd.resolve();
				} else {
					todo.destroy().then(function () {
						var todos = [].concat(list.get('todos'));
						todos.splice(todos.indexOf(todo), 1);
						list.save('todos', todos).then(function () {
							dfd.resolve();
						});
					});
				}
			} else {
				todo.staged.save().then(function () {
					console.log('SAVED', list.get('title'))
					if (todo === newTodo) {
						newTodo = undefined;
						list.save('todos', list.get('todos').concat([todo])).then(function () {
							dfd.resolve();
						});
					} else {
						dfd.resolve();
					}
				});
			}
			dfd.then(function () {
				delete todo.loading;
				updateTodos();
				updateLists();
			});
		}

		var updateTodos = function () {
			var list = state.selectedList,
				todos = _.map(list.get('todos'), function (todo) {
					if (!todo.has('title')) { todo.set('title', ['Untitled todo']) }
					if (!todo.has('completed')) { todo.set('completed', [false]); }
					if (!todo.has('order')) { todo.set('order', [0]); }
					return todo;
				});
			if (newTodo) { todos.push(newTodo); }
			todos = _.sortBy(todos, function (todo) {
				return todo.get('order')[0];
			});
			_.each(todos, function (todo) {
				if (!todo.staged) { staged(todo); }
			});
			$scope.todos = todos;
			$update();
		};

		$scope.toggleTodoCompleted = function (todo) {
			todo.loading = true;
			todo.save('completed', [!todo.get('completed')[0]]).then(function () {
				todo.loading = false;
				updateTodos();
				updateLists();
			});
		};

		var state = $scope.s = {};

		window.$scope = $scope;


	}).directive('setFocus', function($timeout) {
		return {
			link: function ($scope, elem, attrs) {
				$scope.$watch(attrs.setFocus, function (value) {
					if (value === true) { 
						setTimeout(function () { elem[0].focus(); });
					}
				});
			}
		};
	}).directive('clickElsewhere', function($document){
		return {
			restrict: 'A',
			link: function (scope, elem, attr, ctrl) {
				elem.bind('click', function (e) {
					// this part keeps it from firing the click on the document.
					e.stopPropagation();
				});
				$document.bind('click', function() {
					// magic here.
					scope.$apply(attr.clickElsewhere);
				});
			}
		};
	}).directive('ngEscape', ['$parse', function($parse) {
		return function ($scope, elem, attr) {
			var fn = $parse(attr.ngEscape);
			elem.bind('keydown keypress', function (e) {
				if (e.keyCode === 27) {
					$scope.$apply(function() { fn($scope, {$event:e}); });
					setTimeout(function () { elem[0].blur(); });
					e.stopPropagation();
				} else if (e.keyCode === 13) {
					setTimeout(function () { elem[0].blur(); });
				}
			});
		}
	}]);