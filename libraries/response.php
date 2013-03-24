<?php namespace Squire;

class Response extends \Laravel\Response {

	/**
	 * Return an error page, optionally with data/message
	 *
	 * @param  int           HTTP status code
	 * @param  array|string  Data or message
	 */
	public static function error($status = 500, $data = array())
	{
		is_string($data) && $data = array('message' => $data);
		$data['error'] = true;

		if (Request::ajax()) {
			return parent::json($data, $status);
		}

		if ($status == 404) {
			return parent::error($status, $data);
		}

		return Event::first('response.error', [$status, $data]);
	}
}